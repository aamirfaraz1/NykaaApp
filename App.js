import React, { useEffect } from 'react';
import { StyleSheet, View, Alert, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import Constants from 'expo-constants';
import { Camera } from 'expo-camera';

export default function App() {
  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Camera permission is required to use this feature.');
      }
    })();
  }, []);

  return (
    <View style={styles.container}>
      <WebView
        style={{ flex: 1 }}
        source={{ uri: 'https://nykaa.squirrelvision.ai' }}
        mediaCapturePermissionGrantType='grant'
        mediaPlaybackRequiresUserAction={false}
        {...(Platform.OS === 'ios' && { allowsInlineMediaPlayback: true })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginTop: Constants.statusBarHeight,
  },
});
