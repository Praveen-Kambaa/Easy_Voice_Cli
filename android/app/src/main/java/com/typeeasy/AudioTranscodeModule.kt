package com.typeeasy

import android.media.*
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.max
import kotlin.math.min

/**
 * Convert common Android audio containers (m4a/mp4) to 16kHz mono WAV PCM for offline Whisper.
 *
 * Whisper works best with:
 * - 16kHz sample rate
 * - mono
 * - 16-bit PCM WAV
 */
class AudioTranscodeModule(private val reactCtx: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactCtx) {

    override fun getName(): String = "AudioTranscodeModule"

    @ReactMethod
    fun convertToWav16kMono(fileUri: String, promise: Promise) {
        try {
            if (fileUri.isBlank()) {
                promise.reject("NO_FILE", "Audio file URI is required")
                return
            }

            val inputPath = if (fileUri.startsWith("file://")) fileUri.removePrefix("file://") else fileUri
            val inputFile = File(inputPath)
            if (!inputFile.exists() || inputFile.length() <= 0L) {
                promise.reject("FILE_MISSING", "Audio file not found or empty: $inputPath")
                return
            }

            val outFile = File(reactCtx.cacheDir, "whisper_${System.currentTimeMillis()}.wav")
            val wavPath = outFile.absolutePath

            val pcm = decodeToPcm16(inputFile)
            if (pcm.samples.isEmpty()) {
                promise.reject("DECODE_EMPTY", "Could not decode audio to PCM")
                return
            }

            val mono = downmixToMono(pcm.samples, pcm.channels)
            val resampled = resampleLinear(mono, pcm.sampleRate, 16000)

            writeWav16kMono(outFile, resampled)
            promise.resolve("file://$wavPath")
        } catch (e: Exception) {
            promise.reject("TRANSCODE_FAILED", e.message, e)
        }
    }

    private data class PcmOut(
        val sampleRate: Int,
        val channels: Int,
        val samples: ShortArray,
    )

    private fun decodeToPcm16(inputFile: File): PcmOut {
        val extractor = MediaExtractor()
        extractor.setDataSource(inputFile.absolutePath)

        var audioTrackIndex = -1
        var format: MediaFormat? = null
        for (i in 0 until extractor.trackCount) {
            val f = extractor.getTrackFormat(i)
            val mime = f.getString(MediaFormat.KEY_MIME) ?: continue
            if (mime.startsWith("audio/")) {
                audioTrackIndex = i
                format = f
                break
            }
        }
        if (audioTrackIndex < 0 || format == null) {
            extractor.release()
            return PcmOut(16000, 1, ShortArray(0))
        }

        extractor.selectTrack(audioTrackIndex)
        val mime = format.getString(MediaFormat.KEY_MIME) ?: "audio/mp4a-latm"
        val sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
        val channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)

        val codec = MediaCodec.createDecoderByType(mime)
        codec.configure(format, null, null, 0)
        codec.start()

        val bufferInfo = MediaCodec.BufferInfo()
        val out = ByteArrayOutputStream()
        var sawInputEOS = false
        var sawOutputEOS = false

        while (!sawOutputEOS) {
            if (!sawInputEOS) {
                val inIndex = codec.dequeueInputBuffer(10_000)
                if (inIndex >= 0) {
                    val inputBuffer = codec.getInputBuffer(inIndex)!!
                    val sampleSize = extractor.readSampleData(inputBuffer, 0)
                    if (sampleSize < 0) {
                        codec.queueInputBuffer(
                            inIndex,
                            0,
                            0,
                            0L,
                            MediaCodec.BUFFER_FLAG_END_OF_STREAM
                        )
                        sawInputEOS = true
                    } else {
                        val presentationTimeUs = extractor.sampleTime
                        codec.queueInputBuffer(inIndex, 0, sampleSize, presentationTimeUs, 0)
                        extractor.advance()
                    }
                }
            }

            val outIndex = codec.dequeueOutputBuffer(bufferInfo, 10_000)
            when {
                outIndex >= 0 -> {
                    val outputBuffer = codec.getOutputBuffer(outIndex)
                    if (outputBuffer != null && bufferInfo.size > 0) {
                        val chunk = ByteArray(bufferInfo.size)
                        outputBuffer.get(chunk)
                        outputBuffer.clear()
                        out.write(chunk)
                    }
                    codec.releaseOutputBuffer(outIndex, false)
                    if ((bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                        sawOutputEOS = true
                    }
                }
                outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    // ignore
                }
            }
        }

        try {
            codec.stop()
        } catch (_: Exception) {
        }
        codec.release()
        extractor.release()

        val pcmBytes = out.toByteArray()
        if (pcmBytes.isEmpty()) return PcmOut(sampleRate, channels, ShortArray(0))

        // Decoder output is typically 16-bit PCM, little-endian.
        val bb = ByteBuffer.wrap(pcmBytes).order(ByteOrder.LITTLE_ENDIAN)
        val shortCount = pcmBytes.size / 2
        val samples = ShortArray(shortCount)
        for (i in 0 until shortCount) {
            samples[i] = bb.short
        }

        return PcmOut(sampleRate, channels, samples)
    }

    private fun downmixToMono(interleaved: ShortArray, channels: Int): ShortArray {
        if (channels <= 1) return interleaved
        val frames = interleaved.size / channels
        val out = ShortArray(frames)
        var idx = 0
        for (f in 0 until frames) {
            var acc = 0
            for (c in 0 until channels) {
                acc += interleaved[idx++].toInt()
            }
            out[f] = (acc / channels).toShort()
        }
        return out
    }

    private fun resampleLinear(input: ShortArray, inRate: Int, outRate: Int): ShortArray {
        if (inRate == outRate) return input
        if (input.isEmpty() || inRate <= 0 || outRate <= 0) return ShortArray(0)

        val ratio = outRate.toDouble() / inRate.toDouble()
        val outLen = max(1, (input.size * ratio).toInt())
        val out = ShortArray(outLen)

        for (i in 0 until outLen) {
            val srcPos = i / ratio
            val i0 = srcPos.toInt()
            val i1 = min(i0 + 1, input.size - 1)
            val frac = srcPos - i0
            val s0 = input[i0].toInt()
            val s1 = input[i1].toInt()
            val v = (s0 + ((s1 - s0) * frac)).toInt()
            out[i] = v.coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
        }
        return out
    }

    private fun writeWav16kMono(outFile: File, samples: ShortArray) {
        val sampleRate = 16000
        val channels = 1
        val bitsPerSample = 16
        val byteRate = sampleRate * channels * bitsPerSample / 8
        val blockAlign = (channels * bitsPerSample / 8).toShort()
        val dataSize = samples.size * 2
        val riffSize = 36 + dataSize

        FileOutputStream(outFile).use { fos ->
            fun writeString(s: String) = fos.write(s.toByteArray(Charsets.US_ASCII))
            fun writeIntLE(v: Int) = fos.write(
                ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(v).array()
            )
            fun writeShortLE(v: Short) = fos.write(
                ByteBuffer.allocate(2).order(ByteOrder.LITTLE_ENDIAN).putShort(v).array()
            )

            writeString("RIFF")
            writeIntLE(riffSize)
            writeString("WAVE")
            writeString("fmt ")
            writeIntLE(16) // PCM header size
            writeShortLE(1) // PCM format
            writeShortLE(channels.toShort())
            writeIntLE(sampleRate)
            writeIntLE(byteRate)
            writeShortLE(blockAlign)
            writeShortLE(bitsPerSample.toShort())
            writeString("data")
            writeIntLE(dataSize)

            val bb = ByteBuffer.allocate(dataSize).order(ByteOrder.LITTLE_ENDIAN)
            for (s in samples) bb.putShort(s)
            fos.write(bb.array())
        }
    }
}

