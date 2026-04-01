import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import AlertModal from '../components/common/AlertModal';
import { setGlobalAlert, resetGlobalAlert } from '../utils/alertPresenter';
import { setGlobalAlertModalVisible } from '../utils/alertModalState';

const AlertContext = createContext(null);

export const AlertProvider = ({ children }) => {
  const [alertState, setAlertState] = useState({
    visible: false,
    title: '',
    message: '',
    buttons: [],
  });

  const showAlert = useCallback((title, message, buttons) => {
    setAlertState({
      visible: true,
      title: title || '',
      message: message || '',
      buttons: buttons || [{ text: 'OK' }],
    });
  }, []);

  const dismissAlert = useCallback(() => {
    setAlertState(prev => ({ ...prev, visible: false }));
  }, []);

  useEffect(() => {
    setGlobalAlert(showAlert);
    return () => resetGlobalAlert();
  }, [showAlert]);

  useEffect(() => {
    setGlobalAlertModalVisible(alertState.visible);
  }, [alertState.visible]);

  return (
    <AlertContext.Provider value={showAlert}>
      {children}
      <AlertModal
        visible={alertState.visible}
        title={alertState.title}
        message={alertState.message}
        buttons={alertState.buttons}
        onDismiss={dismissAlert}
      />
    </AlertContext.Provider>
  );
};

export const useAlert = () => {
  const ctx = useContext(AlertContext);
  if (!ctx) {
    // Fallback to native Alert if used outside provider
    const { Alert } = require('react-native');
    return Alert.alert.bind(Alert);
  }
  return ctx;
};
