import { CameraView, useCameraPermissions, type BarcodeScanningResult, type BarcodeType } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from 'react-native';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScannedCode {
  /** Raw barcode/QR data */
  data: string;
  /** Human-readable format label (e.g. "EAN-13", "QR Code") */
  format: string;
  /** Raw barcode type returned by the camera */
  type: string;
}

export interface ProductFormData {
  barcode: string;
  format: string;
  name: string;
  expirationDate: string; // YYYY-MM-DD
}

interface ScannerModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Called when the modal is dismissed */
  onClose: () => void;
  /** Called when a code is successfully scanned */
  onScan: (code: ScannedCode) => void;
  /** Called when a product is registered after scanning */
  onProductRegister: (data: ProductFormData) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WINDOW_WIDTH = Dimensions.get('window').width;
const SCAN_FRAME_SIZE = WINDOW_WIDTH * 0.7;

const FORMAT_LABELS: Record<string, string> = {
  qr: 'QR Code',
  ean13: 'EAN-13',
  ean8: 'EAN-8',
  code39: 'Code 39',
  code93: 'Code 93',
  code128: 'Code 128',
  upc_e: 'UPC-E',
  upc_a: 'UPC-A',
  itf14: 'ITF-14',
  codabar: 'Codabar',
  pdf417: 'PDF417',
  datamatrix: 'Data Matrix',
  aztec: 'Aztec',
};

const BARCODE_TYPES: BarcodeType[] = [
  'qr',
  'ean13',
  'ean8',
  'code39',
  'code93',
  'code128',
  'upc_e',
  'upc_a',
  'itf14',
  'codabar',
  'pdf417',
  'datamatrix',
];

const SCAN_DELAY_MS = 800; // Brief pause so user sees the green frame before modal closes

const QUICK_DATES = [
  { label: '1 mês', months: 1 },
  { label: '3 meses', months: 3 },
  { label: '6 meses', months: 6 },
  { label: '1 ano', months: 12 },
] as const;

// ---------------------------------------------------------------------------
// Animated scan line
// ---------------------------------------------------------------------------

function ScanLine() {
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(translateY, {
          toValue: SCAN_FRAME_SIZE - 4,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [translateY]);

  return (
    <Animated.View
      style={[overlayStyles.scanLine, { transform: [{ translateY }] }]}
      pointerEvents="none"
    />
  );
}

// ---------------------------------------------------------------------------
// ScannerModal
// ---------------------------------------------------------------------------

export function ScannerModal({ visible, onClose, onScan, onProductRegister }: ScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [torch, setTorch] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [mode, setMode] = useState<'scanning' | 'form'>('scanning');
  const [scannedCode, setScannedCode] = useState<ScannedCode | null>(null);
  const [productName, setProductName] = useState('');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [saving, setSaving] = useState(false);

  const isProcessing = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dayRef = useRef<TextInput>(null);
  const monthRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);

  // Reset state every time modal opens
  useEffect(() => {
    if (visible) {
      setScanned(false);
      setTorch(false);
      setMode('scanning');
      setScannedCode(null);
      setProductName('');
      setDay('');
      setMonth('');
      setYear('');
      setSaving(false);
      isProcessing.current = false;
      if (closeTimer.current) clearTimeout(closeTimer.current);
    }
  }, [visible]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  // ---- Handlers ----

  const handleBarcodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      if (isProcessing.current || scanned) return;
      isProcessing.current = true;

      const { data, type } = result;
      const format = FORMAT_LABELS[type] || type.toUpperCase();

      // Haptic / vibration feedback
      if (Platform.OS === 'ios') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Vibration.vibrate(200);
      }

      setScanned(true);

      // Brief delay so the user sees the green confirmation frame
      closeTimer.current = setTimeout(() => {
        const code = { data, format, type };
        setScannedCode(code);
        onScan(code);
        setMode('form');
      }, SCAN_DELAY_MS);
    },
    [scanned, onScan, onClose],
  );

  const toggleTorch = useCallback(() => setTorch((prev) => !prev), []);
  const flipCamera = useCallback(() => {
    setFacing((prev) => (prev === 'back' ? 'front' : 'back'));
  }, []);

  // ---- Reste permission state when modal closes ----
  // no need: useCameraPermissions stays mounted via parent.

  // ---- Permission UI inside modal ----

  const renderPermissionView = () => (
    <View style={styles.centered}>
      <Text style={styles.permissionIcon}>📷</Text>
      <Text style={styles.permissionTitle}>Permissão Necessária</Text>
      <Text style={styles.permissionText}>
        Precisamos de acesso à sua câmera para escanear códigos de barras e QR codes.
      </Text>
      <Pressable
        style={({ pressed }) => [styles.permissionBtn, pressed && styles.permissionBtnPressed]}
        onPress={requestPermission}
      >
        <Text style={styles.permissionBtnText}>Conceder Permissão</Text>
      </Pressable>
    </View>
  );

  const renderLoadingView = () => (
    <View style={styles.centered}>
      <Text style={styles.permissionText}>Preparando câmera...</Text>
    </View>
  );

  // ---- Validation ----

  const validateAndSubmit = useCallback(async () => {
    const name = productName.trim();
    if (!name) {
      Alert.alert('Nome obrigatório', 'Digite o nome do produto.');
      return;
    }

    const d = parseInt(day, 10);
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);

    if (!d || !m || !y || d < 1 || d > 31 || m < 1 || m > 12 || y < 2024 || y > 2100) {
      Alert.alert('Data inválida', 'Verifique o dia, mês e ano da validade.');
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

    if (!scannedCode) return;

    setSaving(true);

    onProductRegister({
      barcode: scannedCode.data,
      format: scannedCode.format,
      name,
      expirationDate: expDate,
    });

    onClose();
  }, [productName, day, month, year, scannedCode, onProductRegister, onClose]);

  // ---- Render form ----

  const renderProductForm = () => (
    <KeyboardAvoidingView
      style={formStyles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={formStyles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={formStyles.header}>
            <Text style={formStyles.headerIcon}>✅</Text>
            <Text style={formStyles.headerTitle}>Produto Escaneado</Text>
            <Text style={formStyles.headerSubtitle}>
              Código: {scannedCode?.data}
            </Text>
            <View style={formStyles.formatBadge}>
              <Text style={formStyles.formatText}>{scannedCode?.format}</Text>
            </View>
          </View>

          {/* Product name */}
          <View style={formStyles.fieldGroup}>
            <Text style={formStyles.label}>Nome do Produto</Text>
            <TextInput
              style={formStyles.input}
              placeholder="Ex: Leite Integral"
              placeholderTextColor="#999"
              value={productName}
              onChangeText={setProductName}
              autoFocus
              returnKeyType="next"
              onSubmitEditing={() => dayRef.current?.focus()}
            />
          </View>

          {/* Expiration date */}
          <View style={formStyles.fieldGroup}>
            <Text style={formStyles.label}>Data de Validade</Text>
            <View style={formStyles.dateRow}>
              <View style={formStyles.dateField}>
                <Text style={formStyles.dateLabel}>Dia</Text>
                <TextInput
                  ref={dayRef}
                  style={formStyles.dateInput}
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
                  returnKeyType="next"
                />
              </View>
              <Text style={formStyles.dateSeparator}>/</Text>
              <View style={formStyles.dateField}>
                <Text style={formStyles.dateLabel}>Mês</Text>
                <TextInput
                  ref={monthRef}
                  style={formStyles.dateInput}
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
                  returnKeyType="next"
                />
              </View>
              <Text style={formStyles.dateSeparator}>/</Text>
              <View style={[formStyles.dateField, { flex: 1.5 }]}>
                <Text style={formStyles.dateLabel}>Ano</Text>
                <TextInput
                  ref={yearRef}
                  style={formStyles.dateInput}
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
                  onSubmitEditing={validateAndSubmit}
                />
              </View>
            </View>
          </View>

          {/* Quick select buttons */}
          <View style={formStyles.quickRow}>
            {QUICK_DATES.map(({ label, months }) => {
              const future = new Date();
              future.setMonth(future.getMonth() + months);
              return (
                <Pressable
                  key={label}
                  style={({ pressed }) => [
                    formStyles.quickBtn,
                    pressed && formStyles.quickBtnPressed,
                  ]}
                  onPress={() => {
                    setDay(String(future.getDate()).padStart(2, '0'));
                    setMonth(String(future.getMonth() + 1).padStart(2, '0'));
                    setYear(String(future.getFullYear()));
                  }}
                >
                  <Text style={formStyles.quickBtnText}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Actions */}
          <View style={formStyles.actions}>
            <Pressable
              style={({ pressed }) => [
                formStyles.saveBtn,
                pressed && formStyles.saveBtnPressed,
              ]}
              onPress={validateAndSubmit}
              disabled={saving}
            >
              <Text style={formStyles.saveBtnText}>
                {saving ? 'Salvando...' : 'Salvar Produto'}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                formStyles.cancelBtn,
                pressed && formStyles.cancelBtnPressed,
              ]}
              onPress={() => {
                if (closeTimer.current) clearTimeout(closeTimer.current);
                setMode('scanning');
                setScanned(false);
                setProductName('');
                setDay('');
                setMonth('');
                setYear('');
                isProcessing.current = false;
              }}
            >
              <Text style={formStyles.cancelBtnText}>Escanear outro</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );

  // ---- Main render ----

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {!permission
        ? renderLoadingView()
        : !permission.granted
          ? renderPermissionView()
          : (
            <View style={styles.container}>
              {mode === 'form' && scannedCode
                ? renderProductForm()
                : (
              <CameraView
                style={StyleSheet.absoluteFill}
                facing={facing}
                enableTorch={torch}
                barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
                onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
              >
                {/* ---- Overlay ---- */}
                <View style={overlayStyles.container} pointerEvents="box-none">
                  {/* Black backdrop with cut-out */}
                  <View style={overlayStyles.topSection} pointerEvents="none" />
                  <View style={overlayStyles.middleSection} pointerEvents="none">
                    <View style={overlayStyles.side} />
                    <View style={overlayStyles.frameArea} />
                    <View style={overlayStyles.side} />
                  </View>
                  <View style={overlayStyles.bottomSection} pointerEvents="none" />

                  {/* Corner brackets */}
                  <View style={overlayStyles.cornerWrapper} pointerEvents="none">
                    <View style={[overlayStyles.corner, overlayStyles.cornerTL, scanned && overlayStyles.cornerScanned]} />
                    <View style={[overlayStyles.corner, overlayStyles.cornerTR, scanned && overlayStyles.cornerScanned]} />
                    <View style={[overlayStyles.corner, overlayStyles.cornerBL, scanned && overlayStyles.cornerScanned]} />
                    <View style={[overlayStyles.corner, overlayStyles.cornerBR, scanned && overlayStyles.cornerScanned]} />
                  </View>

                  {/* Scan line */}
                  {!scanned && <ScanLine />}

                  {/* Instruction */}
                  {!scanned && (
                    <Text style={overlayStyles.instruction}>
                      Posicione o código de barras{'\n'}dentro da área delimitada
                    </Text>
                  )}

                  {/* Success overlay */}
                  {scanned && (
                    <View style={overlayStyles.successContainer} pointerEvents="none">
                      <Text style={overlayStyles.successIcon}>✅</Text>
                      <Text style={overlayStyles.successText}>Código lido com sucesso!</Text>
                    </View>
                  )}

                  {/* Close button */}
                  <Pressable
                    style={({ pressed }) => [overlayStyles.closeBtn, pressed && overlayStyles.closeBtnPressed]}
                    onPress={onClose}
                    hitSlop={16}
                  >
                    <Text style={overlayStyles.closeBtnText}>✕</Text>
                  </Pressable>

                  {/* Flash & Flip controls */}
                  <SafeAreaView style={overlayStyles.controls}>
                    <ControlButton
          icon={torch ? '💡' : '🔦'}
          label={torch ? 'Desligar' : 'Lanterna'}
                      onPress={toggleTorch}
                      active={torch}
                    />
                    <ControlButton icon="🔄" label="Virar Câmera" onPress={flipCamera} />
                  </SafeAreaView>
                </View>
              </CameraView>
              )}
            </View>
          )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Small reusable control button
// ---------------------------------------------------------------------------

function ControlButton({
  icon,
  label,
  onPress,
  active,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        overlayStyles.controlBtn,
        active && overlayStyles.controlBtnActive,
        pressed && overlayStyles.controlBtnPressed,
      ]}
      onPress={onPress}
    >
      <Text style={[overlayStyles.controlIcon, active && overlayStyles.controlIconActive]}>
        {icon}
      </Text>
      <Text style={[overlayStyles.controlLabel, active && overlayStyles.controlLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ===========================================================================
// Styles
// ===========================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#0a0a0a',
  },
  permissionIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  permissionText: {
    fontSize: 16,
    color: '#aaa',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  permissionBtn: {
    backgroundColor: '#0a7ea4',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  permissionBtnPressed: {
    backgroundColor: '#086a8a',
  },
  permissionBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

const overlayStyles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },

  /* Backdrop */
  topSection: {
    flex: 0.3,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  middleSection: {
    flexDirection: 'row',
    height: SCAN_FRAME_SIZE,
  },
  side: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  frameArea: {
    width: SCAN_FRAME_SIZE,
  },
  bottomSection: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },

  /* Corner brackets */
  cornerWrapper: {
    position: 'absolute',
    top: Dimensions.get('window').height * 0.3,
    left: (WINDOW_WIDTH - SCAN_FRAME_SIZE) / 2,
    width: SCAN_FRAME_SIZE,
    height: SCAN_FRAME_SIZE,
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: '#0a7ea4',
  },
  cornerScanned: {
    borderColor: '#34c759',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 4,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 4,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 4,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 4,
  },

  /* Scan line */
  scanLine: {
    position: 'absolute',
    top: Dimensions.get('window').height * 0.3,
    left: (WINDOW_WIDTH - SCAN_FRAME_SIZE) / 2 + 4,
    width: SCAN_FRAME_SIZE - 8,
    height: 3,
    backgroundColor: '#0a7ea4',
    borderRadius: 2,
    opacity: 0.7,
  },

  /* Instruction text */
  instruction: {
    position: 'absolute',
    bottom: Dimensions.get('window').height * 0.18,
    width: '100%',
    textAlign: 'center',
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
  },

  /* Success overlay */
  successContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  successIcon: {
    fontSize: 64,
    marginBottom: 12,
  },
  successText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#34c759',
  },

  /* Close button */
  closeBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 40,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  closeBtnPressed: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    transform: [{ scale: 0.9 }],
  },
  closeBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },

  /* Control buttons */
  controls: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 80,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
  },
  controlBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    gap: 2,
  },
  controlBtnActive: {
    backgroundColor: 'rgba(10,126,164,0.35)',
    borderColor: '#0a7ea4',
  },
  controlBtnPressed: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    transform: [{ scale: 0.95 }],
  },
  controlIcon: {
    fontSize: 24,
    opacity: 0.9,
  },
  controlIconActive: {
    opacity: 1,
  },
  controlLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  controlLabelActive: {
    color: '#fff',
  },
});

// ===========================================================================
// Product Registration Form Styles
// ===========================================================================

const formStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f7',
  },
  scroll: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 8,
  },
  headerIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#888',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 8,
  },
  formatBadge: {
    backgroundColor: '#0a7ea4',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  formatText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  fieldGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
    marginBottom: 8,
    marginLeft: 2,
  },
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
  dateRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  dateField: {
    flex: 1,
  },
  dateLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#888',
    marginBottom: 4,
    marginLeft: 2,
  },
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
  dateSeparator: {
    fontSize: 24,
    color: '#999',
    paddingBottom: Platform.OS === 'ios' ? 14 : 12,
    fontWeight: '300',
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  quickBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  quickBtnPressed: {
    backgroundColor: '#e8f4f8',
    borderColor: '#0a7ea4',
  },
  quickBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0a7ea4',
  },
  actions: {
    gap: 12,
  },
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
  saveBtnPressed: {
    backgroundColor: '#086a8a',
    transform: [{ scale: 0.98 }],
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  cancelBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  cancelBtnPressed: {
    backgroundColor: '#f5f5f5',
  },
  cancelBtnText: {
    color: '#666',
    fontSize: 15,
    fontWeight: '600',
  },
});
