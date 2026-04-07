package com.typeeasy

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.os.Process
import android.util.Log
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Records PCM via [AudioRecord] into a WAV file.
 * Tries multiple sample rates and [MediaRecorder.AudioSource] values — required for reliable
 * capture across OEMs during cellular calls (Android 10+ often blocks a single fixed config).
 */
class CallWavRecorder {
    private var audioRecord: AudioRecord? = null
    private var raf: RandomAccessFile? = null
    private var thread: Thread? = null
    private val stopRequested = AtomicBoolean(false)

    @Volatile
    private var pcmBytesWritten = 0L

    /** Sample rate used for the running capture; must match WAV header on finalize. */
    @Volatile
    private var effectiveSampleRate: Int = 44_100

    /**
     * Max absolute PCM sample (0–32767) after last [stopAndFinalize], measured from file data.
     * Low values mean the file is effectively silent (common when OEM blocks call audio for third-party apps).
     */
    @Volatile
    var lastCapturedPeakAbs: Int = 0
        private set

    fun start(file: File): Boolean {
        stopInternal()
        lastCapturedPeakAbs = 0
        val channelConfig = AudioFormat.CHANNEL_IN_MONO
        val audioFormat = AudioFormat.ENCODING_PCM_16BIT

        val sampleRates = intArrayOf(
            48_000,
            44_100,
            16_000,
            22_050,
            8_000,
        )

        val sources = buildAudioSourceList()

        for (rate in sampleRates) {
            val minBuf = AudioRecord.getMinBufferSize(rate, channelConfig, audioFormat)
            if (minBuf <= 0) {
                Log.w(TAG, "getMinBufferSize invalid for rate=$rate minBuf=$minBuf")
                continue
            }
            val bufferSize = (minBuf * 2).coerceAtLeast(minBuf)

            for (source in sources) {
                if (tryStartRecording(file, rate, source, channelConfig, audioFormat, bufferSize)) {
                    effectiveSampleRate = rate
                    Log.i(TAG, "Recording started: rate=$rate source=$source file=${file.name}")
                    return true
                }
            }
        }
        Log.e(TAG, "Could not start AudioRecord for any rate/source combination")
        return false
    }

    private fun buildAudioSourceList(): IntArray {
        val list = ArrayList<Int>()
        list.add(MediaRecorder.AudioSource.VOICE_COMMUNICATION)
        list.add(MediaRecorder.AudioSource.VOICE_CALL)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            list.add(MediaRecorder.AudioSource.VOICE_PERFORMANCE)
        }
        list.add(MediaRecorder.AudioSource.MIC)
        list.add(MediaRecorder.AudioSource.DEFAULT)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            list.add(MediaRecorder.AudioSource.UNPROCESSED)
        }
        list.add(MediaRecorder.AudioSource.CAMCORDER)
        return list.toIntArray()
    }

    private fun tryStartRecording(
        file: File,
        sampleRate: Int,
        source: Int,
        channelConfig: Int,
        audioFormat: Int,
        bufferSize: Int,
    ): Boolean {
        var ar: AudioRecord? = null
        var out: RandomAccessFile? = null
        val initDone = CountDownLatch(1)
        val captureReady = AtomicBoolean(false)
        var captureThread: Thread? = null
        return try {
            ar = AudioRecord(
                source,
                sampleRate,
                channelConfig,
                audioFormat,
                bufferSize,
            )
            if (ar.state != AudioRecord.STATE_INITIALIZED) {
                Log.d(TAG, "AudioRecord not initialized: rate=$sampleRate source=$source")
                ar.release()
                return false
            }
            out = RandomAccessFile(file, "rw")
            out.setLength(0)
            out.seek(44)
            pcmBytesWritten = 0L
            stopRequested.set(false)
            val buf = ByteArray(bufferSize)
            val outRef = out
            val arRef = ar
            captureThread = Thread({
                Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO)
                var openedCapture = false
                try {
                    arRef.startRecording()
                    if (arRef.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
                        Log.w(TAG, "startRecording did not enter RECORDING state rate=$sampleRate source=$source")
                        return@Thread
                    }
                    captureReady.set(true)
                    openedCapture = true
                    initDone.countDown()
                    while (!stopRequested.get()) {
                        val n = arRef.read(buf, 0, buf.size)
                        if (n > 0) {
                            synchronized(outRef) {
                                outRef.write(buf, 0, n)
                                pcmBytesWritten += n.toLong()
                            }
                        } else if (n < 0) {
                            Log.w(TAG, "AudioRecord.read error: $n")
                            break
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Read loop failed: rate=$sampleRate source=$source", e)
                } finally {
                    if (!openedCapture) {
                        initDone.countDown()
                    }
                    try {
                        arRef.stop()
                    } catch (_: Exception) {
                    }
                    try {
                        arRef.release()
                    } catch (_: Exception) {
                    }
                }
            }, "CallWavRecorder")
            captureThread.start()
            val awaited = initDone.await(2, TimeUnit.SECONDS)
            val ok = awaited && captureReady.get()
            if (!ok) {
                stopRequested.set(true)
                try {
                    captureThread.join(4_000)
                } catch (_: Exception) {
                }
                try {
                    out.close()
                } catch (_: Exception) {
                }
                try {
                    if (file.exists()) {
                        file.delete()
                    }
                } catch (_: Exception) {
                }
                audioRecord = null
                raf = null
                thread = null
                Log.d(TAG, "tryStartRecording aborted (init timeout or not recording): rate=$sampleRate source=$source")
                return false
            }
            audioRecord = ar
            raf = out
            thread = captureThread
            true
        } catch (e: Exception) {
            Log.d(TAG, "tryStartRecording failed: rate=$sampleRate source=$source — ${e.message}")
            stopRequested.set(true)
            try {
                captureThread?.join(2_000)
            } catch (_: Exception) {
            }
            try {
                ar?.release()
            } catch (_: Exception) {
            }
            try {
                out?.close()
            } catch (_: Exception) {
            }
            try {
                if (file.exists() && file.length() == 0L) {
                    file.delete()
                }
            } catch (_: Exception) {
            }
            false
        }
    }

    /**
     * Stops capture, writes the 44-byte WAV header at the start of [file], closes streams.
     * Returns PCM data length in bytes, or -1 on failure.
     */
    fun stopAndFinalize(file: File): Long {
        stopRequested.set(true)
        try {
            thread?.join(15_000)
        } catch (_: Exception) {
        }
        thread = null
        audioRecord = null

        val out = raf
        raf = null
        val rate = effectiveSampleRate
        val pcmLen = pcmBytesWritten.toInt()

        try {
            out?.close()
        } catch (_: Exception) {
        }

        if (pcmLen < MIN_PCM_BYTES) {
            Log.w(TAG, "PCM too short ($pcmLen bytes), discarding")
            try {
                file.delete()
            } catch (_: Exception) {
            }
            return -1L
        }
        return try {
            RandomAccessFile(file, "rw").use { r ->
                writeWavHeader(r, pcmLen, rate, 1, 16)
            }
            val peak = measurePcmPeakAbs16Le(file, pcmLen)
            lastCapturedPeakAbs = peak
            if (peak < SILENCE_PEAK_THRESHOLD) {
                Log.e(
                    TAG,
                    "Capture looks SILENT (peakAbs=$peak, threshold=$SILENCE_PEAK_THRESHOLD). " +
                        "Many phones block call uplink/downlink for normal apps; system dialer recording uses OEM-only APIs. " +
                        "Try speakerphone so the microphone can pick up the earpiece, or expect only your voice.",
                )
            } else {
                Log.i(TAG, "WAV finalized: pcmBytes=$pcmLen rate=$rate peakAbs=$peak path=${file.absolutePath}")
            }
            pcmLen.toLong()
        } catch (e: Exception) {
            Log.e(TAG, "finalize WAV failed", e)
            -1L
        }
    }

    private fun stopInternal() {
        stopRequested.set(true)
        try {
            thread?.join(4000)
        } catch (_: Exception) {
        }
        thread = null
        try {
            audioRecord?.stop()
        } catch (_: Exception) {
        }
        try {
            audioRecord?.release()
        } catch (_: Exception) {
        }
        audioRecord = null
        try {
            raf?.close()
        } catch (_: Exception) {
        }
        raf = null
        pcmBytesWritten = 0L
    }

    /**
     * Scan first ~1s of PCM (or less); 16-bit LE mono after 44-byte WAV header.
     * Returns max absolute sample magnitude (0–32767).
     */
    private fun measurePcmPeakAbs16Le(file: File, pcmByteLen: Int): Int {
        if (pcmByteLen < 2 || !file.exists()) return 0
        val maxScan = minOf(pcmByteLen, PEAK_SCAN_MAX_BYTES)
        return try {
            RandomAccessFile(file, "r").use { r ->
                r.seek(44L)
                val buf = ByteArray(8192)
                var maxPeak = 0
                var scanned = 0
                while (scanned < maxScan) {
                    val want = minOf(buf.size, maxScan - scanned)
                    val n = r.read(buf, 0, want)
                    if (n <= 0) break
                    var i = 0
                    while (i + 1 < n) {
                        val lo = buf[i].toInt() and 0xFF
                        val hi = buf[i + 1].toInt() and 0xFF
                        var sample = lo or (hi shl 8)
                        if (sample > 32767) sample -= 65536
                        val av = kotlin.math.abs(sample)
                        if (av > maxPeak) maxPeak = av
                        i += 2
                    }
                    scanned += n
                }
                maxPeak
            }
        } catch (e: Exception) {
            Log.w(TAG, "measurePcmPeak failed: ${e.message}")
            0
        }
    }

    companion object {
        private const val TAG = "CallWavRecorder"
        /** Reject noise / failed opens (~ < 80 ms at 48 kHz mono 16-bit). */
        private const val MIN_PCM_BYTES = 5000
        /** ~1 second at 48 kHz mono 16-bit. */
        private const val PEAK_SCAN_MAX_BYTES = 96_000
        /** Below this max |sample| (16-bit), treat as silent / blocked capture for UX + metadata. */
        const val SILENCE_PEAK_THRESHOLD = 250

        fun writeWavHeader(raf: RandomAccessFile, pcmDataLen: Int, sampleRate: Int, channels: Short, bitsPerSample: Short) {
            val byteRate = sampleRate * channels * bitsPerSample / 8
            val blockAlign = (channels * bitsPerSample / 8).toShort()
            val riffChunkSize = 36 + pcmDataLen
            val bb = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
            bb.put("RIFF".toByteArray(Charsets.US_ASCII))
            bb.putInt(riffChunkSize)
            bb.put("WAVE".toByteArray(Charsets.US_ASCII))
            bb.put("fmt ".toByteArray(Charsets.US_ASCII))
            bb.putInt(16)
            bb.putShort(1)
            bb.putShort(channels)
            bb.putInt(sampleRate)
            bb.putInt(byteRate)
            bb.putShort(blockAlign)
            bb.putShort(bitsPerSample)
            bb.put("data".toByteArray(Charsets.US_ASCII))
            bb.putInt(pcmDataLen)
            raf.seek(0)
            raf.write(bb.array())
        }
    }
}
