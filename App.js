import React, { useEffect, useState, useRef } from "react";
import {
  StyleSheet,
  View,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { WebView } from "react-native-webview";
import Constants from "expo-constants";
import { Camera } from "expo-camera";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import NfcManager, { NfcEvents, Ndef } from "react-native-nfc-manager";

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [webViewLoaded, setWebViewLoaded] = useState(false);
  const webviewRef = useRef(null);

  useEffect(() => {
    NfcManager.start();
    // Request camera permissions
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Denied",
          "Camera permission is required to use this feature."
        );
      }
    })();

    // Check for stored credentials and handle biometric authentication
    checkCredentials();

    return () => {
      NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
      NfcManager.unregisterTagEvent().catch(() => 0);
    };
  }, []);

  // Check if credentials are stored and attempt biometric authentication
  const checkCredentials = async () => {
    const email = await SecureStore.getItemAsync("email");
    const password = await SecureStore.getItemAsync("password");

    if (email && password) {
      handleAuthentication(); // Authenticate if credentials exist
    } else {
      setAuthenticated(true); // Allow WebView to show if no credentials stored
    }
  };

  // Perform biometric authentication
  const handleAuthentication = async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (hasHardware && isEnrolled) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Authenticate to continue",
        fallbackLabel: "Use Passcode",
      });

      if (result.success) {
        setAuthenticated(true); // Authentication successful, show WebView
      } else {
        Alert.alert("Authentication Failed", "Please try again.");
      }
    } else {
      Alert.alert(
        "Biometric Authentication not available",
        "Proceeding without biometric authentication."
      );
      setAuthenticated(true); // Allow WebView to show if no biometrics available
    }
  };

  // Inject JavaScript to autofill and submit login form
  const INJECTED_JAVASCRIPT = `
    (function() {
      window.addEventListener('load', function() {
        if (window.location.pathname === '/login') {
          window.ReactNativeWebView.postMessage('LOGIN_PAGE');
          
          document.querySelector('form').addEventListener('submit', function() {
            const email = document.querySelector('input[name="email"]').value;
            const password = document.querySelector('input[name="password"]').value;
            window.ReactNativeWebView.postMessage('SAVE_CREDENTIALS||' + email + '||' + password);
          });
        }
      });
    })();
    true;
  `;

  // Handle messages from WebView
  const onMessage = async (event) => {
    const message = event.nativeEvent.data;

    if (message === "LOGIN_PAGE") {
      // Retrieve stored credentials and inject into the form
      const email = await SecureStore.getItemAsync("email");
      const password = await SecureStore.getItemAsync("password");

      if (email && password) {
        const script = `
          document.querySelector('input[name="email"]').value = "${email}";
          document.querySelector('input[name="password"]').value = "${password}";
          document.querySelector('form').submit();
        `;
        webviewRef.current.injectJavaScript(script);
      }
    } else if (message.startsWith("SAVE_CREDENTIALS")) {
      // Save email and password when first login is detected
      const [_, email, password] = message.split("||");
      await SecureStore.setItemAsync("email", email);
      await SecureStore.setItemAsync("password", password);
    }  else if (message === 'PAGE_LOADED') {
      setWebViewLoaded(true);
    }
  };

  // NFC Functionality
  useEffect(() => {
    if (authenticated && webViewLoaded) {
      // Set up NFC tag discovery listener
      NfcManager.setEventListener(NfcEvents.DiscoverTag, handleTagDiscovered);
 
      // Start NFC scanning
      if (Platform.OS === 'android') {
        NfcManager.registerTagEvent().catch(error => {
          console.warn('NFC Error', error);
        });
      }
    }
 
    return () => {
      NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
      NfcManager.unregisterTagEvent().catch(() => 0);
    };
  }, [authenticated, webViewLoaded]);
 
  const handleTagDiscovered = (tag) => {
    console.log('Tag Discovered', tag);
 
    // Read the button ID from the NFC tag
    const buttonId = getButtonIdFromTag(tag);
 
    if (buttonId && webviewRef.current) {
      // Generate JavaScript code to inject into the WebView
      const jsCode = `document.getElementById('${buttonId}').click(); true;`;
      webviewRef.current.injectJavaScript(jsCode);
    } else {
      Alert.alert('Unknown Tag', 'This NFC tag is not recognized.');
    }
 
    // Stop NFC scanning after a tag is detected (Android)
    if (Platform.OS === 'android') {
      NfcManager.unregisterTagEvent().catch(() => 0);
      // Restart NFC scanning after a short delay
      setTimeout(() => {
        NfcManager.registerTagEvent().catch(error => {
          console.warn('NFC Error', error);
        });
      }, 1000);
    }
  };
 
  const getButtonIdFromTag = (tag) => {
    // Extract NDEF message from the tag
    const ndefRecords = tag.ndefMessage;
 
    if (ndefRecords && ndefRecords.length > 0) {
      // Assume the first record contains the button ID
      const record = ndefRecords[0];
 
      // Decode the payload
      const payload = Ndef.text.decodePayload(record.payload);
 
      // Trim and normalize the button ID
      const buttonId = payload.trim();
 
      // Validate the button ID against your list
      const validButtonIds = ['nykaa_cosmetics', 'kaybeauty', 'mac', 'ct'];
      if (validButtonIds.includes(buttonId)) {
        return buttonId;
      }
    }
 
    return null;
  };
 
  // For iOS, function to start NFC scanning
  const startNfcScan = () => {
    NfcManager.registerTagEvent().catch(error => {
      console.warn('NFC Error', error);
    });
  };

  return (
    <View style={styles.container}>
      {authenticated ? (
        <>
          <WebView
            ref={webviewRef}
            style={{ flex: 1 }}
            source={{ uri: "https://nykaa.squirrelvision.ai/login" }}
            mediaCapturePermissionGrantType="grant"
            mediaPlaybackRequiresUserAction={false}
            injectedJavaScript={INJECTED_JAVASCRIPT}
            onMessage={onMessage}
            javaScriptEnabled={true}
            startInLoadingState={true}
            renderLoading={() => (
              <ActivityIndicator size="large" color="#E53475" />
            )}
            {...(Platform.OS === "ios" && { allowsInlineMediaPlayback: true })}
            onError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              console.warn('WebView error: ', nativeEvent);
            }}
            onHttpError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              console.warn('WebView HTTP error: ', nativeEvent);
            }}
          />
          {Platform.OS === "ios" && (
            <Button title="Scan NFC Tag" onPress={startNfcScan} />
          )}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginTop: Constants.statusBarHeight,
  },
});
