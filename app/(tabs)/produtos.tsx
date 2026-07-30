import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { Product } from '@/types/product';
import { daysUntilExpiration, getExpirationStatus } from '@/types/product';
import { getProducts, deleteProduct, updateProduct } from '@/services/storage';
import {
  cancelProductNotifications,
  rescheduleExpirationReminders,
} from '@/services/notifications';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

// ---------------------------------------------------------------------------
// ProdutosScreen
// ---------------------------------------------------------------------------

export default function ProdutosScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [editName, setEditName] = useState('');
  const [editLote, setEditLote] = useState('');
  const [editQtd, setEditQtd] = useState('');
  const [editDay, setEditDay] = useState('');
  const [editMonth, setEditMonth] = useState('');
  const [editYear, setEditYear] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'expired' | 'expiring' | 'valid'>('all');

  // ---- Computed filtered list ----

  const filteredProducts = products.filter((p) => {
    // Text search filter
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      const matchesName = p.name.toLowerCase().includes(query);
      const matchesBarcode = p.barcode.toLowerCase().includes(query);
      const matchesLote = p.lote?.toLowerCase().includes(query) ?? false;
      if (!matchesName && !matchesBarcode && !matchesLote) return false;
    }

    // Status filter
    const days = daysUntilExpiration(p.expirationDate);
    if (filterMode === 'expired') return days < 0;
    if (filterMode === 'expiring') return days >= 0 && days <= 7;
    if (filterMode === 'valid') return days > 7;
    return true; // 'all'
  });

  // ---- Load ----

  const loadProducts = useCallback(async () => {
    const stored = await getProducts();
    setProducts(stored);
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // ---- Delete ----

  const handleDelete = useCallback(
    (product: Product) => {
      Alert.alert('Remover Produto', `Remover "${product.name}"?`, [
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
      ]);
    },
    [loadProducts],
  );

  // ---- Edit ----

  const openEdit = useCallback((product: Product) => {
    setEditProduct(product);
    setEditName(product.name);
    setEditLote(product.lote || '');
    setEditQtd(product.quantidade?.toString() || '');
    const [y, m, d] = product.expirationDate.split('-');
    setEditDay(d);
    setEditMonth(m);
    setEditYear(y);
  }, []);

  const closeEdit = useCallback(() => {
    setEditProduct(null);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editProduct) return;

    const name = editName.trim();
    if (!name) {
      Alert.alert('Nome obrigatório', 'Digite o nome do produto.');
      return;
    }

    const dNum = parseInt(editDay, 10);
    const mNum = parseInt(editMonth, 10);
    const yNum = parseInt(editYear, 10);

    if (!dNum || !mNum || !yNum || dNum < 1 || dNum > 31 || mNum < 1 || mNum > 12 || yNum < 2024 || yNum > 2100) {
      Alert.alert('Data inválida', 'Verifique a data de validade.');
      return;
    }

    const expDate = `${yNum}-${String(mNum).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;

    const updated = await updateProduct(editProduct.id, {
      name,
      lote: editLote.trim() || undefined,
      quantidade: editQtd.trim() ? Number(editQtd) : undefined,
      expirationDate: expDate,
    });

    if (updated) {
      await rescheduleExpirationReminders(updated);
    }

    closeEdit();
    await loadProducts();
  }, [editProduct, editName, editLote, editQtd, editDay, editMonth, editYear, closeEdit, loadProducts]);

  // ---- Render product ----

  const renderProduct = ({ item }: { item: Product }) => {
    const days = daysUntilExpiration(item.expirationDate);
    const status = getExpirationStatus(days);

    return (
      <View style={cardStyles.card}>
        {/* Image */}
        {item.imagem ? (
          <Image source={{ uri: item.imagem }} style={cardStyles.image} />
        ) : (
          <View style={cardStyles.imagePlaceholder}>
            <Text style={cardStyles.imagePlaceholderText}>📦</Text>
          </View>
        )}

        {/* Info */}
        <View style={cardStyles.content}>
          <Text style={cardStyles.name} numberOfLines={1}>{item.name}</Text>
          <Text style={cardStyles.barcode}>{item.barcode}</Text>
          <View style={cardStyles.meta}>
            {item.lote && <Text style={cardStyles.metaText}>Lote: {item.lote}</Text>}
            {item.quantidade != null && <Text style={cardStyles.metaText}>Qtd: {item.quantidade}</Text>}
          </View>
          <View style={cardStyles.row}>
            <Text style={cardStyles.date}>Val: {formatDate(item.expirationDate)}</Text>
            <View style={[cardStyles.statusBadge, { backgroundColor: status.bgColor }]}>
              <Text style={[cardStyles.statusText, { color: status.color }]}>
                {days < 0 ? `Atrasado ${Math.abs(days)}d` : status.label}
              </Text>
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={cardStyles.actions}>
          <Pressable
            style={({ pressed }) => [cardStyles.actionBtn, pressed && { opacity: 0.6 }]}
            onPress={() => openEdit(item)}
            hitSlop={8}
          >
            <Text style={cardStyles.actionIcon}>✏️</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [cardStyles.actionBtn, pressed && { opacity: 0.6 }]}
            onPress={() => handleDelete(item)}
            hitSlop={8}
          >
            <Text style={cardStyles.actionIcon}>🗑️</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  // ---- Empty ----

  const renderEmpty = () => (
    <View style={emptyStyles.container}>
      <Text style={emptyStyles.icon}>📦</Text>
      <Text style={emptyStyles.title}>Nenhum produto</Text>
      <Text style={emptyStyles.subtitle}>
        Cadastre produtos na aba{'\n'}"Cadastro" para vê-los aqui
      </Text>
    </View>
  );

  // ---- Summary ----

  const renderSummary = () => {
    const expired = products.filter((p) => daysUntilExpiration(p.expirationDate) < 0).length;
    const expiring = products.filter((p) => {
      const d = daysUntilExpiration(p.expirationDate);
      return d >= 0 && d <= 7;
    }).length;

    return (
      <View style={pageStyles.summaryRow}>
        <View style={[pageStyles.summaryChip, { backgroundColor: '#e74c3c15' }]}>
          <Text style={[pageStyles.summaryValue, { color: '#e74c3c' }]}>{expired}</Text>
          <Text style={[pageStyles.summaryLabel, { color: '#e74c3c' }]}>Vencidos</Text>
        </View>
        <View style={[pageStyles.summaryChip, { backgroundColor: '#e67e2215' }]}>
          <Text style={[pageStyles.summaryValue, { color: '#e67e22' }]}>{expiring}</Text>
          <Text style={[pageStyles.summaryLabel, { color: '#e67e22' }]}>A vencer (7d)</Text>
        </View>
        <View style={[pageStyles.summaryChip, { backgroundColor: '#0a7ea415' }]}>
          <Text style={[pageStyles.summaryValue, { color: '#0a7ea4' }]}>{products.length}</Text>
          <Text style={[pageStyles.summaryLabel, { color: '#0a7ea4' }]}>Total</Text>
        </View>
      </View>
    );
  };

  // ---- Main ----

  return (
    <SafeAreaView style={pageStyles.safe}>
      <StatusBar barStyle="dark-content" />

      <View style={pageStyles.header}>
        <Text style={pageStyles.title}>Produtos</Text>
        <Text style={pageStyles.subtitle}>{products.length} item(ns) cadastrado(s)</Text>
      </View>

      {/* Search bar */}
      <View style={pageStyles.searchContainer}>
        <View style={pageStyles.searchBar}>
          <Text style={pageStyles.searchIcon}>🔍</Text>
          <TextInput
            style={pageStyles.searchInput}
            placeholder="Buscar por nome, código ou lote..."
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <Text style={pageStyles.searchClear}>✕</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Filter chips */}
      <View style={pageStyles.filterRow}>
        {FILTER_CHIPS.map(({ key, label }) => (
          <Pressable
            key={key}
            style={({ pressed }) => [
              pageStyles.filterChip,
              filterMode === key && pageStyles.filterChipActive,
              pressed && pageStyles.filterChipPressed,
            ]}
            onPress={() => setFilterMode(key)}
          >
            <Text
              style={[
                pageStyles.filterChipText,
                filterMode === key && pageStyles.filterChipTextActive,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {filteredProducts.length > 0 && renderSummary()}

      <FlatList
        data={filteredProducts}
        keyExtractor={(p) => p.id}
        renderItem={renderProduct}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={filteredProducts.length === 0 ? pageStyles.emptyList : pageStyles.list}
        showsVerticalScrollIndicator={false}
        onRefresh={loadProducts}
        refreshing={false}
      />

      {/* Edit Modal */}
      <Modal visible={!!editProduct} animationType="slide" transparent onRequestClose={closeEdit}>
        <View style={modalStyles.backdrop}>
          <View style={modalStyles.container}>
            <SafeAreaView style={{ flex: 1 }}>
              <ScrollView contentContainerStyle={modalStyles.scroll} keyboardShouldPersistTaps="handled">
                <Text style={modalStyles.title}>Editar Produto</Text>

                {editProduct?.imagem && (
                  <Image source={{ uri: editProduct.imagem }} style={modalStyles.previewImage} />
                )}

                <Text style={modalStyles.label}>Nome</Text>
                <TextInput style={modalStyles.input} value={editName} onChangeText={setEditName} />

                <Text style={modalStyles.label}>Lote</Text>
                <TextInput style={modalStyles.input} value={editLote} onChangeText={setEditLote} />

                <Text style={modalStyles.label}>Quantidade</Text>
                <TextInput
                  style={modalStyles.input}
                  value={editQtd}
                  onChangeText={setEditQtd}
                  keyboardType="number-pad"
                />

                <Text style={modalStyles.label}>Data de Validade</Text>
                <View style={modalStyles.dateRow}>
                  <TextInput
                    style={[modalStyles.dateInput, { flex: 1 }]}
                    placeholder="DD"
                    value={editDay}
                    onChangeText={(t) => setEditDay(t.replace(/[^0-9]/g, '').slice(0, 2))}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                  <Text style={modalStyles.dateSep}>/</Text>
                  <TextInput
                    style={[modalStyles.dateInput, { flex: 1 }]}
                    placeholder="MM"
                    value={editMonth}
                    onChangeText={(t) => setEditMonth(t.replace(/[^0-9]/g, '').slice(0, 2))}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                  <Text style={modalStyles.dateSep}>/</Text>
                  <TextInput
                    style={[modalStyles.dateInput, { flex: 1.5 }]}
                    placeholder="AAAA"
                    value={editYear}
                    onChangeText={(t) => setEditYear(t.replace(/[^0-9]/g, '').slice(0, 4))}
                    keyboardType="number-pad"
                    maxLength={4}
                  />
                </View>

                <View style={modalStyles.actions}>
                  <Pressable
                    style={({ pressed }) => [modalStyles.saveBtn, pressed && modalStyles.saveBtnPressed]}
                    onPress={saveEdit}
                  >
                    <Text style={modalStyles.saveBtnText}>Salvar</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [modalStyles.cancelBtn, pressed && modalStyles.cancelBtnPressed]}
                    onPress={closeEdit}
                  >
                    <Text style={modalStyles.cancelBtnText}>Cancelar</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </SafeAreaView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Filter constants
// ---------------------------------------------------------------------------

const FILTER_CHIPS = [
  { key: 'all' as const, label: 'Todos' },
  { key: 'expired' as const, label: 'Vencidos' },
  { key: 'expiring' as const, label: 'A vencer (7d)' },
  { key: 'valid' as const, label: 'Válidos' },
];

// ===========================================================================
// Styles
// ===========================================================================

const pageStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f5f7' },
  header: { paddingHorizontal: 24, paddingTop: Platform.OS === 'ios' ? 12 : 20, paddingBottom: 8 },
  title: { fontSize: 32, fontWeight: '800', color: '#111', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: '#888', marginTop: 2, fontWeight: '500' },
  summaryRow: { flexDirection: 'row', paddingHorizontal: 24, paddingBottom: 12, gap: 10 },
  summaryChip: { flex: 1, alignItems: 'center', borderRadius: 12, paddingVertical: 10 },
  summaryValue: { fontSize: 20, fontWeight: '800' },
  summaryLabel: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  list: { paddingHorizontal: 16, paddingBottom: 30 },
  emptyList: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Search bar
  searchContainer: { paddingHorizontal: 16, paddingBottom: 8 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchIcon: { fontSize: 16, marginRight: 8, opacity: 0.5 },
  searchInput: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 15,
    color: '#111',
  },
  searchClear: { fontSize: 16, color: '#999', padding: 4, fontWeight: '600' },

  // Filter chips
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  filterChipActive: {
    backgroundColor: '#0a7ea4',
    borderColor: '#0a7ea4',
  },
  filterChipPressed: {
    opacity: 0.7,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  filterChipTextActive: {
    color: '#fff',
  },
});

const cardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  image: { width: 48, height: 48, borderRadius: 10, marginRight: 12 },
  imagePlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#e8e8ed',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  imagePlaceholderText: { fontSize: 24 },
  content: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', color: '#222' },
  barcode: { fontSize: 10, color: '#aaa', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginTop: 1 },
  meta: { flexDirection: 'row', gap: 12, marginTop: 2 },
  metaText: { fontSize: 11, color: '#888', fontWeight: '500' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  date: { fontSize: 12, color: '#777', fontWeight: '500' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '700' },
  actions: { justifyContent: 'center', gap: 8, marginLeft: 8 },
  actionBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' },
  actionIcon: { fontSize: 16 },
});

const emptyStyles = StyleSheet.create({
  container: { alignItems: 'center', paddingHorizontal: 40 },
  icon: { fontSize: 72, marginBottom: 20, opacity: 0.6 },
  title: { fontSize: 20, fontWeight: '700', color: '#333', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 15, color: '#999', textAlign: 'center', lineHeight: 22 },
});

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#f5f5f7',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  scroll: { padding: 24, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '800', color: '#111', marginBottom: 20, textAlign: 'center' },
  previewImage: { width: 80, height: 80, borderRadius: 12, alignSelf: 'center', marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 6, marginTop: 8, marginLeft: 2 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    fontSize: 16,
    color: '#111',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dateInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    fontSize: 16,
    color: '#111',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    textAlign: 'center',
    fontWeight: '600',
  },
  dateSep: { fontSize: 20, color: '#999', paddingBottom: Platform.OS === 'ios' ? 14 : 12 },
  actions: { gap: 10, marginTop: 24 },
  saveBtn: {
    backgroundColor: '#0a7ea4',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#0a7ea4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnPressed: { backgroundColor: '#086a8a', transform: [{ scale: 0.98 }] },
  saveBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  cancelBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fff' },
  cancelBtnPressed: { backgroundColor: '#f5f5f5' },
  cancelBtnText: { color: '#666', fontSize: 15, fontWeight: '600' },
});
