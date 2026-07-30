import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ScannerModal, type ScannedCode } from '@/components/scanner-modal';
import { requestNotificationPermissions, scheduleExpirationReminders } from '@/services/notifications';
import { createProduct, getProducts } from '@/services/storage';
import { fetchProductByBarcode } from '@/services/openfoodfacts';

// ---------------------------------------------------------------------------
// CadastroScreen
// ---------------------------------------------------------------------------

export default function CadastroScreen() {
  const [barcode, setBarcode] = useState('');
  const [format, setFormat] = useState('');
  const [productName, setProductName] = useState('');
  const [lote, setLote] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loadingApi, setLoadingApi] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [notificationsGranted, setNotificationsGranted] = useState(false);

  const dayRef = useRef<TextInput>(null);
  const monthRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);

  // ---- Init ----

  useEffect(() => {
    (async () => {
      const granted = await requestNotificationPermissions();
      setNotificationsGranted(granted);
    })();
  }, []);

  // ---- Helpers ----

  const resetForm = useCallback(() => {
    setBarcode('');
    setFormat('');
    setProductName('');
    setLote('');
    setQuantidade('');
    setDay('');
    setMonth('');
    setYear('');
    setImageUri(null);
    setLoadingApi(false);
    setSaving(false);
  }, []);

  // ---- Scanner ----

  const openScanner = useCallback(() => setScannerVisible(true), []);
  const closeScanner = useCallback(() => setScannerVisible(false), []);

  const handleScan = useCallback((code: ScannedCode) => {
    setBarcode(code.data);
    setFormat(code.format);
  }, []);

  // ---- Open Food Facts ----

  const lookupBarcode = useCallback(async () => {
    const code = barcode.trim();
    if (!code) {
      Alert.alert('Código vazio', 'Escaneie ou digite um código de barras primeiro.');
      return;
    }

    setLoadingApi(true);
    try {
      const result = await fetchProductByBarcode(code);
      if (result.found && result.name) {
        setProductName(result.name);
        // Usa o updater funcional para não depender de `imageUri` no closure
        // Só define a imagem da API se o usuário não tiver tirado foto ainda
        setImageUri((prev) => (result.imageUrl && !prev ? result.imageUrl : prev));
        Alert.alert('Produto encontrado!', `Nome: ${result.name}`);
      } else {
        Alert.alert('Produto não encontrado', 'Digite o nome manualmente.');
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível consultar a API.');
    } finally {
      setLoadingApi(false);
    }
  }, [barcode]);

  // ---- Photo ----

  const takePhoto = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permissão necessária', 'Precisamos de acesso à câmera para tirar foto.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      setImageUri(result.assets[0].uri);
    }
  }, []);

  // ---- Save ----

  const handleSave = useCallback(async () => {
    const name = productName.trim();
    if (!name) {
      Alert.alert('Nome obrigatório', 'Digite o nome do produto.');
      return;
    }

    const d = parseInt(day, 10);
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);

    if (!d || !m || !y || d < 1 || d > 31 || m < 1 || m > 12 || y < 2024 || y > 2100) {
      Alert.alert('Data inválida', 'Verifique a data de validade.');
      return;
    }

    const expDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const exp = new Date(expDate + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    if (exp <= now) {
      Alert.alert('Data inválida', 'A data de validade deve ser futura.');
      return;
    }

    setSaving(true);

    try {
      const product = await createProduct({
        barcode: barcode || 'manual',
        format: format || 'Manual',
        name,
        lote: lote.trim() || undefined,
        quantidade: quantidade.trim() ? Number(quantidade) : undefined,
        imagem: imageUri || undefined,
        expirationDate: expDate,
        notificationIds: [],
      });

      if (notificationsGranted) {
        await scheduleExpirationReminders(product);
      }

      Alert.alert('Sucesso!', `Produto "${name}" cadastrado com sucesso.`, [
        { text: 'OK', onPress: resetForm },
      ]);
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar o produto.');
    } finally {
      setSaving(false);
    }
  }, [productName, day, month, year, barcode, format, lote, quantidade, imageUri, notificationsGranted, resetForm]);

  // ---- Quick dates ----

  const QUICK_DATES = [
    { label: '1 mês', months: 1 },
    { label: '3 meses', months: 3 },
    { label: '6 meses', months: 6 },
    { label: '1 ano', months: 12 },
  ] as const;

  const setQuickDate = (months: number) => {
    const future = new Date();
    future.setMonth(future.getMonth() + months);
    setDay(String(future.getDate()).padStart(2, '0'));
    setMonth(String(future.getMonth() + 1).padStart(2, '0'));
    setYear(String(future.getFullYear()));
  };

  // ---- Render ----

  return (
    <SafeAreaView style={pageStyles.safe}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={pageStyles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={pageStyles.header}>
            <Text style={pageStyles.title}>Cadastro</Text>
            <Text style={pageStyles.subtitle}>Adicionar novo produto</Text>
          </View>

          {/* Photo */}
          <Pressable style={pageStyles.photoArea} onPress={takePhoto}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={pageStyles.photo} />
            ) : (
              <View style={pageStyles.photoPlaceholder}>
                <Text style={pageStyles.photoPlaceholderIcon}>📷</Text>
                <Text style={pageStyles.photoPlaceholderText}>Tirar Foto</Text>
              </View>
            )}
          </Pressable>

          {/* Barcode field */}
          <View style={fieldStyles.group}>
            <Text style={fieldStyles.label}>Código de Barras</Text>
            <View style={fieldStyles.row}>
              <TextInput
                style={[fieldStyles.input, { flex: 1 }]}
                placeholder="Ex: 7891234567890"
                placeholderTextColor="#999"
                value={barcode}
                onChangeText={setBarcode}
                autoCapitalize="none"
                returnKeyType="search"
                onSubmitEditing={lookupBarcode}
              />
              <Pressable
                style={({ pressed }) => [fieldStyles.smallBtn, pressed && fieldStyles.smallBtnPressed]}
                onPress={lookupBarcode}
                disabled={loadingApi}
              >
                {loadingApi ? (
                  <Text style={fieldStyles.smallBtnText}>...</Text>
                ) : (
                  <MaterialIcons name="search" size={22} color="#fff" />
                )}
              </Pressable>
            </View>
          </View>

          {/* Product name */}
          <View style={fieldStyles.group}>
            <Text style={fieldStyles.label}>Nome do Produto</Text>
            <TextInput
              style={fieldStyles.input}
              placeholder="Ex: Leite Integral"
              placeholderTextColor="#999"
              value={productName}
              onChangeText={setProductName}
              returnKeyType="next"
              onSubmitEditing={() => dayRef.current?.focus()}
            />
          </View>

          {/* Lote & Quantidade row */}
          <View style={fieldStyles.row}>
            <View style={[fieldStyles.group, { flex: 1, marginRight: 8 }]}>
              <Text style={fieldStyles.label}>Lote</Text>
              <TextInput
                style={fieldStyles.input}
                placeholder="Lote 123"
                placeholderTextColor="#999"
                value={lote}
                onChangeText={setLote}
                returnKeyType="next"
              />
            </View>
            <View style={[fieldStyles.group, { flex: 1, marginLeft: 8 }]}>
              <Text style={fieldStyles.label}>Quantidade</Text>
              <TextInput
                style={fieldStyles.input}
                placeholder="10"
                placeholderTextColor="#999"
                value={quantidade}
                onChangeText={setQuantidade}
                keyboardType="number-pad"
                returnKeyType="next"
              />
            </View>
          </View>

          {/* Expiration date */}
          <View style={fieldStyles.group}>
            <Text style={fieldStyles.label}>Data de Validade</Text>
            <View style={fieldStyles.dateRow}>
              <View style={fieldStyles.dateField}>
                <TextInput
                  ref={dayRef}
                  style={fieldStyles.dateInput}
                  placeholder="DD"
                  placeholderTextColor="#999"
                  value={day}
                  onChangeText={(t) => {
                    const cleaned = t.replace(/[^0-9]/g, '').slice(0, 2);
                    setDay(cleaned);
                    if (cleaned.length === 2) monthRef.current?.focus();
                  }}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>
              <Text style={fieldStyles.dateSep}>/</Text>
              <View style={fieldStyles.dateField}>
                <TextInput
                  ref={monthRef}
                  style={fieldStyles.dateInput}
                  placeholder="MM"
                  placeholderTextColor="#999"
                  value={month}
                  onChangeText={(t) => {
                    const cleaned = t.replace(/[^0-9]/g, '').slice(0, 2);
                    setMonth(cleaned);
                    if (cleaned.length === 2) yearRef.current?.focus();
                  }}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>
              <Text style={fieldStyles.dateSep}>/</Text>
              <View style={[fieldStyles.dateField, { flex: 1.5 }]}>
                <TextInput
                  ref={yearRef}
                  style={fieldStyles.dateInput}
                  placeholder="AAAA"
                  placeholderTextColor="#999"
                  value={year}
                  onChangeText={(t) => {
                    const cleaned = t.replace(/[^0-9]/g, '').slice(0, 4);
                    setYear(cleaned);
                  }}
                  keyboardType="number-pad"
                  maxLength={4}
                  returnKeyType="done"
                  onSubmitEditing={handleSave}
                />
              </View>
            </View>
            {/* Quick dates */}
            <View style={fieldStyles.quickRow}>
              {QUICK_DATES.map(({ label, months }) => (
                <Pressable
                  key={label}
                  style={({ pressed }) => [fieldStyles.quickBtn, pressed && fieldStyles.quickBtnPressed]}
                  onPress={() => setQuickDate(months)}
                >
                  <Text style={fieldStyles.quickBtnText}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Save */}
          <Pressable
            style={({ pressed }) => [fieldStyles.saveBtn, pressed && fieldStyles.saveBtnPressed]}
            onPress={handleSave}
            disabled={saving}
          >
            <MaterialIcons name="save" size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={fieldStyles.saveBtnText}>
            {saving ? 'Salvando...' : 'Salvar Produto'}
          </Text>
          </Pressable>

          {/* ── TEST NOTIFICATION BUTTON ── */}
          <Pressable
            style={({ pressed }) => [fieldStyles.testBtn, pressed && fieldStyles.testBtnPressed]}
            onPress={async () => {
              if (!notificationsGranted) {
                Alert.alert('Permissão negada', 'As notificações não foram autorizadas. Vá em Configurações > Notificações e ative-as.');
                return;
              }
              const all = await getProducts();
              if (all.length === 0) {
                Alert.alert('Nenhum produto', 'Cadastre um produto primeiro para testar a notificação.');
                return;
              }
              const random = all[Math.floor(Math.random() * all.length)];
              const days = Math.floor(Math.random() * 30) + 1;
              try {
                await Notifications.scheduleNotificationAsync({
                  content: {
                    title: '📦 TESTE: Produto próximo do vencimento!',
                    body: `[TESTE] O produto "${random.name}" está ${days} dias de vencer.`,
                    data: { productId: random.id, daysBefore: days },
                    sound: true,
                  },
                  trigger: {
                    type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                    seconds: 2,
                  },
                });
                Alert.alert('Notificação enviada!', `Uma notificação de teste para "${random.name}" será exibida em 2 segundos.`);
              } catch {
                Alert.alert('Erro', 'Não foi possível enviar a notificação de teste.');
              }
            }}
          >
            <MaterialIcons name="notifications-active" size={20} color="#e67e22" />
            <Text style={fieldStyles.testBtnText}>Testar Notificação</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* FAB */}
      <Pressable
        style={({ pressed }) => [fabStyles.button, pressed && fabStyles.buttonPressed]}
        onPress={openScanner}
      >
        <MaterialIcons name="camera-alt" size={28} color="#fff" />
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
  safe: { flex: 1, backgroundColor: '#f5f5f7' },
  scroll: { paddingHorizontal: 24, paddingBottom: 120 },
  header: { paddingTop: Platform.OS === 'ios' ? 12 : 20, paddingBottom: 16 },
  title: { fontSize: 32, fontWeight: '800', color: '#111', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: '#888', marginTop: 2, fontWeight: '500' },
  photoArea: { alignItems: 'center', marginBottom: 20 },
  photo: { width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: '#0a7ea4' },
  photoPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#e8e8ed',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ccc',
    borderStyle: 'dashed',
  },
  photoPlaceholderIcon: { fontSize: 32 },
  photoPlaceholderText: { fontSize: 11, color: '#888', marginTop: 4, fontWeight: '600' },
});

const fieldStyles = StyleSheet.create({
  group: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 6, marginLeft: 2 },
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  smallBtn: {
    backgroundColor: '#0a7ea4',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
  },
  smallBtnPressed: { backgroundColor: '#086a8a' },
  smallBtnText: { fontSize: 18 },
  dateRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  dateField: { flex: 1 },
  dateInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    fontSize: 18,
    color: '#111',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    textAlign: 'center',
    fontWeight: '600',
  },
  dateSep: { fontSize: 24, color: '#999', paddingBottom: Platform.OS === 'ios' ? 14 : 12, fontWeight: '300' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  quickBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  quickBtnPressed: { backgroundColor: '#e8f4f8', borderColor: '#0a7ea4' },
  quickBtnText: { fontSize: 13, fontWeight: '600', color: '#0a7ea4' },
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
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: '#e67e22',
    shadowColor: '#e67e22',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  testBtnPressed: { backgroundColor: '#fff8f0', transform: [{ scale: 0.98 }] },
  testBtnText: { fontSize: 15, fontWeight: '700', color: '#e67e22' },
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
    shadowColor: '#0a7ea4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  buttonPressed: { backgroundColor: '#086a8a', transform: [{ scale: 0.92 }] },
});
