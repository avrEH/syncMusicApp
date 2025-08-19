import { Audio } from 'expo-av';
import * as MediaLibrary from 'expo-media-library';
import { useEffect, useState } from 'react';
import { Button, FlatList, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  connect,
  initialize,
  startDiscoveringPeers,
  subscribeOnPeersUpdates
} from 'react-native-wifi-reborn';


export default function App() {
  // --- Existing States ---
  const [audioFiles, setAudioFiles] = useState([]);
  const [sound, setSound] = useState();
  const [currentSong, setCurrentSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // --- New States for Wi-Fi P2P ---
  const [devices, setDevices] = useState([]);
  const [isConnected, setIsConnected] = useState(false);


  useEffect(() => {
    // --- Existing Media Library Logic ---
    (async () => {
      let { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') return;
      const media = await MediaLibrary.getAssetsAsync({ mediaType: 'audio' });
      setAudioFiles(media.assets);
    })();

    // --- New Wi-Fi P2P Initialization ---
    (async () => {
      try {
        await initialize();
        // Subscribe to events
        subscribeOnPeersUpdates(({ devices }) => {
          console.log('Peers updated:', devices);
          setDevices(devices);
        });
        // Add more subscribers for connection info, etc. later
      } catch (e) {
        console.error(e);
      }
    })();

  }, []);

  // --- Existing Cleanup Effect ---
  useEffect(() => {
    return sound ? () => { sound.unloadAsync(); } : undefined;
  }, [sound]);

  // --- Existing playSound function ---
  async function playSound(song) {
    if (sound) await sound.unloadAsync();
    if (currentSong?.id === song.id && isPlaying) {
      await sound.pauseAsync();
      setIsPlaying(false);
      return;
    }
    const { sound: newSound } = await Audio.Sound.createAsync({ uri: song.uri });
    setSound(newSound);
    setCurrentSong(song);
    setIsPlaying(true);
    await newSound.playAsync();
  }

  // --- UI Rendering ---
  const renderSongItem = ({ item }) => {
    const isCurrentlyPlaying = item.id === currentSong?.id;
    return (
      <TouchableOpacity onPress={() => playSound(item)}>
        <View style={styles.songItem}>
          <Text style={[styles.songTitle, isCurrentlyPlaying && styles.playingSongTitle]}>
            {item.filename}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };
  
  const renderDeviceItem = ({ item }) => (
    <TouchableOpacity onPress={() => connect(item.deviceAddress)}>
        <View style={styles.deviceItem}>
            <Text style={styles.songTitle}>{item.deviceName}</Text>
        </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <Text style={styles.topBarText}>Offline Music Player</Text>
      </View>

      {/* --- New P2P Discovery Section --- */}
      <View style={styles.p2pSection}>
        <Text style={styles.sectionTitle}>Nearby Devices</Text>
        <Button title="Discover Peers" onPress={() => startDiscoveringPeers()} />
        <FlatList
          data={devices}
          renderItem={renderDeviceItem}
          keyExtractor={(item) => item.deviceAddress}
          ListEmptyComponent={<Text style={styles.placeholderText}>No devices found.</Text>}
        />
      </View>

      {/* Song List Area */}
      <FlatList
        style={styles.songListArea}
        data={audioFiles}
        renderItem={renderSongItem}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.placeholderText}>No music files found.</Text>}
        ListHeaderComponent={<Text style={styles.sectionTitle}>My Music</Text>}
      />

      {/* Player Controls */}
      <View style={styles.playerControls}>
        <TouchableOpacity style={styles.controlButton}>
          <Text style={styles.controlButtonText}>PREV</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.controlButton, styles.playButton]}>
          <Text style={styles.controlButtonText}>{isPlaying ? "PAUSE" : "PLAY"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlButton}>
          <Text style={styles.controlButtonText}>NEXT</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// --- Styles (with additions) ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  topBar: { height: 60, justifyContent: 'center', alignItems: 'center', backgroundColor: '#222' },
  topBarText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  p2pSection: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#333', maxHeight: 200 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 10, marginLeft: 10 },
  deviceItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#222'},
  songListArea: { flex: 1 },
  placeholderText: { color: '#888', fontSize: 16, textAlign: 'center', marginTop: 20 },
  songItem: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
  songTitle: { color: '#fff', fontSize: 16 },
  playingSongTitle: { color: '#1E90FF', fontWeight: 'bold' },
  playerControls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingVertical: 20, borderTopWidth: 1, borderTopColor: '#333' },
  controlButton: { padding: 10 },
  playButton: { backgroundColor: '#1E90FF', width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center' },
  controlButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});