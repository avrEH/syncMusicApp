import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, FlatList, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  connect,
  disconnect,
  initialize,
  sendData,
  startDiscoveringPeers,
  subscribeOnConnectionInfoUpdates,
  subscribeOnDataReceived,
  subscribeOnPeersUpdates,
} from 'react-native-wifi-reborn';

export default function App() {
  // --- Existing States ---
  const [audioFiles, setAudioFiles] = useState([]);
  const soundRef = useRef(new Audio.Sound());
  const [currentSong, setCurrentSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // --- Wi-Fi P2P States ---
  const [devices, setDevices] = useState([]);
  const [connectionInfo, setConnectionInfo] = useState(null);
  const isHost = connectionInfo?.isGroupOwner;

  // --- Main Effect Hook ---
  useEffect(() => {
    (async () => {
      await MediaLibrary.requestPermissionsAsync();
      const media = await MediaLibrary.getAssetsAsync({ mediaType: 'audio' });
      setAudioFiles(media.assets);
    })();

    (async () => {
      try {
        await initialize();
        subscribeOnPeersUpdates(({ devices }) => setDevices(devices));
        subscribeOnConnectionInfoUpdates(info => {
          console.log('Connection info updated:', info);
          setConnectionInfo(info);
        });
        subscribeOnDataReceived(handleDataReceived);
      } catch (e) {
        console.error(e);
      }
    })();

    // Cleanup effect
    return () => {
      soundRef.current.unloadAsync();
      if (connectionInfo) disconnect();
    };
  }, []);

  // --- Data Handling ---
  const handleDataReceived = (data) => {
    const parsedData = JSON.parse(data);
    console.log('Data received:', parsedData.type);

    if (parsedData.type === 'SONG_FILE') {
      // Client receives the song file
      const path = FileSystem.documentDirectory + parsedData.filename;
      FileSystem.writeAsStringAsync(path, parsedData.file, { encoding: FileSystem.EncodingType.Base64 })
        .then(() => {
          const songAsset = { filename: parsedData.filename, uri: path };
          playSound(songAsset, true); // Play immediately as client
        });
    } else if (parsedData.type === 'PLAY_COMMAND') {
      // Client receives a play command
      soundRef.current.playFromPositionAsync(parsedData.position);
      setIsPlaying(true);
    } else if (parsedData.type === 'PAUSE_COMMAND') {
      // Client receives a pause command
      soundRef.current.pauseAsync();
      setIsPlaying(false);
    }
  };

  // --- Playback Logic ---
  const playSound = async (song, isClient = false) => {
    const sound = soundRef.current;
    try {
      const status = await sound.getStatusAsync();
      if (status.isLoaded) {
        await sound.unloadAsync();
      }

      await sound.loadAsync({ uri: song.uri });
      setCurrentSong(song);

      if (!isClient) { // Host controls playback
        await sound.playAsync();
        setIsPlaying(true);
        if (connectionInfo?.groupFormed) {
          const command = { type: 'PLAY_COMMAND', position: 0 };
          sendData(JSON.stringify(command));
        }
      }
    } catch (error) {
      console.error('Error playing sound:', error);
    }
  };

  const handlePlayPause = async () => {
    if (!currentSong) return;

    const sound = soundRef.current;
    const status = await sound.getStatusAsync();
    
    if (isPlaying) {
      await sound.pauseAsync();
      setIsPlaying(false);
      if (isHost) {
        sendData(JSON.stringify({ type: 'PAUSE_COMMAND' }));
      }
    } else {
      await sound.playAsync();
      setIsPlaying(true);
      if (isHost) {
        sendData(JSON.stringify({ type: 'PLAY_COMMAND', position: status.positionMillis }));
      }
    }
  };

  // --- File Transfer Logic ---
  const shareSong = async (song) => {
    if (!connectionInfo?.groupFormed) {
      Alert.alert("Not Connected", "You must be connected to another device to share a song.");
      return;
    }
    try {
      const fileBase64 = await FileSystem.readAsStringAsync(song.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const data = {
        type: 'SONG_FILE',
        filename: song.filename,
        file: fileBase64,
      };
      sendData(JSON.stringify(data));
      // Host plays the song immediately after sending
      playSound(song);
    } catch (error) {
      console.error('Error sharing song:', error);
    }
  };

  // --- UI Rendering ---
  const renderSongItem = ({ item }) => (
    <View style={styles.songItem}>
      <Text style={styles.songTitle}>{item.filename}</Text>
      {connectionInfo?.groupFormed && isHost && (
        <TouchableOpacity style={styles.shareButton} onPress={() => shareSong(item)}>
          <Text style={styles.shareButtonText}>Share & Play</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderDeviceItem = ({ item }) => (
    <TouchableOpacity onPress={() => connect(item.deviceAddress)}>
      <View style={styles.deviceItem}><Text style={styles.songTitle}>{item.deviceName}</Text></View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}><Text style={styles.topBarText}>SyncMusicApp</Text></View>

      <View style={styles.p2pSection}>
        <Text style={styles.sectionTitle}>Nearby Devices ({connectionInfo?.groupFormed ? "Connected" : "Not Connected"})</Text>
        <Button title="Discover Peers" onPress={() => startDiscoveringPeers()} />
        <FlatList data={devices} renderItem={renderDeviceItem} keyExtractor={item => item.deviceAddress} />
      </View>
      
      <FlatList
        style={styles.songListArea}
        data={audioFiles}
        renderItem={renderSongItem}
        keyExtractor={item => item.id}
        ListHeaderComponent={<Text style={styles.sectionTitle}>My Music</Text>}
      />

      <View style={styles.playerControls}>
        <Text style={styles.currentSongText}>{currentSong?.filename || "No song selected"}</Text>
        <TouchableOpacity style={[styles.controlButton, styles.playButton]} onPress={handlePlayPause}>
          <Text style={styles.controlButtonText}>{isPlaying ? "PAUSE" : "PLAY"}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  topBar: { height: 60, justifyContent: 'center', alignItems: 'center', backgroundColor: '#222' },
  topBarText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  p2pSection: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#333', maxHeight: 200 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', margin: 10 },
  deviceItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#222'},
  songListArea: { flex: 1 },
  songItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
  songTitle: { color: '#fff', fontSize: 16 },
  shareButton: { backgroundColor: '#1E90FF', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 5 },
  shareButtonText: { color: '#fff' },
  playerControls: { alignItems: 'center', paddingVertical: 15, borderTopWidth: 1, borderTopColor: '#333' },
  currentSongText: { color: '#888', marginBottom: 15 },
  controlButton: { padding: 10 },
  playButton: { backgroundColor: '#1E90FF', width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center' },
  controlButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});