import { useCallback, useEffect, useState } from 'react';
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

import { ScannerModal, type ScannedCode, type ProductFormData } from '@/components/scanner-modal';
import type { Product } from '@/types/product';
import { daysUntilExpiration, getExpirationStatus } from '@/types/product';
import { getProducts, createProduct, deleteProduct } from '@/services/storage';
import {
  scheduleExpirationReminders,
  requestNotificationPermissions,
  cancelProductNotifications,
} from '@/services/notifications';

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

function truncateBarcode(code: string, maxLen = 20): string {
  if (code.length <= maxLen) return code;
  return code.slice(0, maxLen - 3) + '...';
}

// ---------------------------------------------------------------------------
// HomeScreen
// ---------------------------------------------------------------------------

export default function HomeScreen() {
  const [scannerVisible, setScannerVisible] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [notificationsGranted, setNotificationsGranted] = useState(false);

  // ---- Load products on mount ----

  const loadProducts = useCallback(async () => {
    const stored = await getProducts();
    setProducts(stored);
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // ---- Notification permissions on first launch ----

  useEffect(() => {
    (async () => {
      const granted = await requestNotificationPermissions();
      setNotificationsGranted(granted);
    })();
  }, []);

  // ---- Handlers ----

  const handleScan = useCallback((_code: ScannedCode) => {
    // We don't need to do anything here, the onProductRegister will handle it
  }, []);

  const handleProductRegister = useCallback(
    async (data: ProductFormData) => {
      // Save product
      const product = await createProduct({
        barcode: data.barcode,
        format: data.format,
        name: data.name,
        expirationDate: data.expirationDate,
        notificationIds: [],
      });

      // Schedule notifications
      try {
        if (notificationsGranted) {
          await scheduleExpirationReminders(product);
        }
      } catch {
        // Notifications may fail on some devices
      }

      // Reload products
      await loadProducts();
    },
    [notificationsGranted, loadProducts],
  );

  const openScanner = useCallback(() => setScannerVisible(true), []);
  const closeScanner = useCallback(() => setScannerVisible(false), []);

  const handleDelete = useCallback(
    (product: Product) => {
      Alert.alert(
        'Remover Produto',
        `Tem certeza que deseja remover "${product.name}"?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Remover',
            style: 'destructive',
            onPress: async () => {
              await cancelProductNotifications(product);
              await deleteProduct(product.id);
              await loadProducts();
            },
          },
        ],
      );
    },
    [loadProducts],
  );

  // ---- Render product item ----

  const renderProduct = ({ item }: { item: Product }) => {
    const days = daysUntilExpiration(item.expirationDate);
    const status = getExpirationStatus(days);

    return (
      <Pressable
        style={({ pressed }) => [prodStyles.card, pressed && prodStyles.cardPressed]}
        onLongPress={() => handleDelete(item)}
        delayLongPress={500}
      >
        {/* Status indicator */}
        <View style={[prodStyles.statusDot, { backgroundColor: status.bgColor }]} />

        <View style={prodStyles.content}>
          <Text style={prodStyles.name} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={prodStyles.barcode}>{truncateBarcode(item.barcode)}</Text>
          <View style={prodStyles.meta}>
            <Text style={prodStyles.date}>Val: {formatDate(item.expirationDate)}</Text>
            <Text style={prodStyles.formatBadge}>{item.format}</Text>
          </View>
        </View>

        {/* Days badge */}
        <View style={[prodStyles.daysBadge, { backgroundColor: status.bgColor }]}>
          <Text style={[prodStyles.daysNumber, { color: status.color }]}>
            {days < 0 ? `${Math.abs(days)}d` : days}
          </Text>
          <Text style={[prodStyles.daysLabel, { color: status.color }]}>
            {days < 0 ? 'atrasado' : days === 1 ? 'dia' : 'dias'}
          </Text>
        </View>
      </Pressable>
    );
  };

  // ---- Empty state ----

  const renderEmptyState = () => (
    <View style={emptyStyles.container}>
      <Text style={emptyStyles.icon}>📦</Text>
      <Text style={emptyStyles.title}>Nenhum produto cadastrado</Text>
      <Text style={emptyStyles.subtitle}>
        Escaneie um código de barras{'\n'}para adicionar produtos com validade
      </Text>
    </View>
  );

  // ---- Summary bar ----

  const renderSummary = () => {
    const expiringSoon = products.filter((p) => {
      const d = daysUntilExpiration(p.expirationDate);
      return d >= 0 && d <= 7;
    });
    const expired = products.filter((p) => daysUntilExpiration(p.expirationDate) < 0);

    return (
      <View style={pageStyles.summaryRow}>
        <View style={[pageStyles.summaryChip, { backgroundColor: '#e74c3c15' }]}>
          <Text style={[pageStyles.summaryValue, { color: '#e74c3c' }]}>{expired.length}</Text>
          <Text style={[pageStyles.summaryLabel, { color: '#e74c3c' }]}>Vencidos</Text>
        </View>
        <View style={[pageStyles.summaryChip, { backgroundColor: '#e67e2215' }]}>
          <Text style={[pageStyles.summaryValue, { color: '#e67e22' }]}>{expiringSoon.length}</Text>
          <Text style={[pageStyles.summaryLabel, { color: '#e67e22' }]}>A vencer (7d)</Text>
        </View>
        <View style={[pageStyles.summaryChip, { backgroundColor: '#0a7ea415' }]}>
          <Text style={[pageStyles.summaryValue, { color: '#0a7ea4' }]}>{products.length}</Text>
          <Text style={[pageStyles.summaryLabel, { color: '#0a7ea4' }]}>Total</Text>
        </View>
      </View>
    );
  };

  // ---- Main render ----

  return (
    <SafeAreaView style={pageStyles.safe}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={pageStyles.header}>
        <View>
          <Text style={pageStyles.title}>Validade</Text>
          <Text style={pageStyles.subtitle}>Controle de Vencimentos</Text>
        </View>

        {!notificationsGranted && (
          <Pressable
            onPress={async () => {
              const granted = await requestNotificationPermissions();
              setNotificationsGranted(granted);
            }}
            hitSlop={8}
          >
            <Text style={pageStyles.permBtn}>🔔 Ativar</Text>
          </Pressable>
        )}
      </View>

      {/* Summary */}
      {products.length > 0 && renderSummary()}

      {/* Product list */}
      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        renderItem={renderProduct}
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={products.length === 0 ? pageStyles.emptyListContainer : pageStyles.listContainer}
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
        onProductRegister={handleProductRegister}
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
  permBtn: {
    fontSize: 14,
    color: '#0a7ea4',
    fontWeight: '600',
  },
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingBottom: 12,
    gap: 10,
  },
  summaryChip: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 10,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

const prodStyles = StyleSheet.create({
  card: {
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
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  statusDot: {
    width: 4,
    height: 40,
    borderRadius: 2,
    marginRight: 14,
  },
  content: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222',
    lineHeight: 20,
  },
  barcode: {
    fontSize: 11,
    color: '#aaa',
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  date: {
    fontSize: 12,
    color: '#777',
    fontWeight: '500',
  },
  formatBadge: {
    fontSize: 10,
    color: '#0a7ea4',
    fontWeight: '700',
    backgroundColor: '#e8f4f8',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  daysBadge: {
    alignItems: 'center',
    minWidth: 56,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginLeft: 10,
  },
  daysNumber: {
    fontSize: 20,
    fontWeight: '800',
  },
  daysLabel: {
    fontSize: 9,
    fontWeight: '600',
    marginTop: 1,
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
