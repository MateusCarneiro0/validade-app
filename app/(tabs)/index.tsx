import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ScannerModal, type ScannedCode } from '@/components/scanner-modal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HistoryItem {
  id: string;
  data: string;
  format: string;
  type: string;
  scannedAt: Date;
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function formatTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (diffSec < 60) return 'Agora mesmo';
  if (diffMin < 60) return `Há ${diffMin} min`;
  if (diffHour < 24) return `Há ${diffHour} h`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function truncateData(data: string, maxLen = 40): string {
  if (data.length <= maxLen) return data;
  return data.slice(0, maxLen - 3) + '...';
}

// ---------------------------------------------------------------------------
// Format badge colours
// ---------------------------------------------------------------------------

const FORMAT_COLORS: Record<string, string> = {
  'QR Code': '#8e44ad',
  'EAN-13': '#0a7ea4',
  'EAN-8': '#2980b9',
  'Code 39': '#27ae60',
  'Code 93': '#2ecc71',
  'Code 128': '#d35400',
  'UPC-A': '#c0392b',
  'UPC-E': '#e74c3c',
  'ITF-14': '#f39c12',
  Codabar: '#1abc9c',
  PDF417: '#9b59b6',
  'Data Matrix': '#34495e',
  Aztec: '#7f8c8d',
};

// ---------------------------------------------------------------------------
// HomeScreen
// ---------------------------------------------------------------------------

export default function HomeScreen() {
  const [scannerVisible, setScannerVisible] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // ---- Handlers ----

  const handleScan = useCallback((code: ScannedCode) => {
    const item: HistoryItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      data: code.data,
      format: code.format,
      type: code.type,
      scannedAt: new Date(),
    };
    setHistory((prev) => [item, ...prev]);
  }, []);

  const openScanner = useCallback(() => setScannerVisible(true), []);
  const closeScanner = useCallback(() => setScannerVisible(false), []);

  const clearHistory = useCallback(() => {
    if (history.length === 0) return;
    Alert.alert('Limpar Histórico', 'Tem certeza que deseja limpar todo o histórico de escaneamentos?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Limpar', style: 'destructive', onPress: () => setHistory([]) },
    ]);
  }, [history]);

  // ---- Render item ----

  const renderHistoryItem = ({ item }: { item: HistoryItem }) => {
    const bgColor = FORMAT_COLORS[item.format] || '#555';
    return (
      <View style={itemStyles.container}>
        <View style={[itemStyles.badge, { backgroundColor: bgColor }]}>
          <Text style={itemStyles.badgeText}>{item.format}</Text>
        </View>
        <View style={itemStyles.content}>
          <Text style={itemStyles.data} numberOfLines={2}>
            {truncateData(item.data)}
          </Text>
          <Text style={itemStyles.time}>{formatTime(item.scannedAt)}</Text>
        </View>
      </View>
    );
  };

  // ---- Empty state ----

  const renderEmptyState = () => (
    <View style={emptyStyles.container}>
      <Text style={emptyStyles.icon}>📷</Text>
      <Text style={emptyStyles.title}>Nenhum código lido ainda</Text>
      <Text style={emptyStyles.subtitle}>
        Toque no botão flutuante{'\n'}para escanear um código de barras ou QR Code
      </Text>
    </View>
  );

  // ---- Main render ----

  return (
    <SafeAreaView style={pageStyles.safe}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={pageStyles.header}>
        <View>
          <Text style={pageStyles.title}>Validade</Text>
          <Text style={pageStyles.subtitle}>Leitor de Códigos de Barras</Text>
        </View>

        {history.length > 0 && (
          <Pressable onPress={clearHistory} hitSlop={8}>
            <Text style={pageStyles.clearBtn}>Limpar</Text>
          </Pressable>
        )}
      </View>

      {/* Counter row */}
      {history.length > 0 && (
        <View style={pageStyles.counterRow}>
          <Text style={pageStyles.counterText}>
            {history.length} {history.length === 1 ? 'item escaneado' : 'itens escaneados'}
          </Text>
        </View>
      )}

      {/* History list */}
      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        renderItem={renderHistoryItem}
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={history.length === 0 ? pageStyles.emptyListContainer : pageStyles.listContainer}
        showsVerticalScrollIndicator={false}
      />

      {/* FAB */}
      <Pressable
        style={({ pressed }) => [fabStyles.button, pressed && fabStyles.buttonPressed]}
        onPress={openScanner}
      >
        <Text style={fabStyles.icon}>{Platform.OS === 'ios' ? '􀎷' : '📷'}</Text>
      </Pressable>

      {/* Scanner Modal */}
      <ScannerModal
        visible={scannerVisible}
        onClose={closeScanner}
        onScan={handleScan}
      />
    </SafeAreaView>
  );
}

// ===========================================================================
// Styles
// ===========================================================================

const pageStyles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f5f5f7',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 12 : 20,
    paddingBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#111',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 2,
    fontWeight: '500',
  },
  clearBtn: {
    fontSize: 15,
    color: '#0a7ea4',
    fontWeight: '600',
  },
  counterRow: {
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  counterText: {
    fontSize: 13,
    color: '#999',
    fontWeight: '500',
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 100, // space for FAB
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

const itemStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    // Shadow (iOS)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    // Shadow (Android)
    elevation: 2,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginRight: 14,
    minWidth: 56,
    alignItems: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  data: {
    fontSize: 15,
    fontWeight: '500',
    color: '#222',
    lineHeight: 20,
  },
  time: {
    fontSize: 12,
    color: '#aaa',
    marginTop: 4,
    fontWeight: '400',
  },
});

const emptyStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  icon: {
    fontSize: 72,
    marginBottom: 20,
    opacity: 0.6,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#999',
    textAlign: 'center',
    lineHeight: 22,
  },
});

const fabStyles = StyleSheet.create({
  button: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 36 : 24,
    right: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#0a7ea4',
    justifyContent: 'center',
    alignItems: 'center',
    // Shadow (iOS)
    shadowColor: '#0a7ea4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    // Shadow (Android)
    elevation: 8,
  },
  buttonPressed: {
    backgroundColor: '#086a8a',
    transform: [{ scale: 0.92 }],
  },
  icon: {
    fontSize: 28,
    color: '#fff',
  },
});
