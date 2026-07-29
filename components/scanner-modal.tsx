import { CameraView, useCameraPermissions, type BarcodeScanningResult, type BarcodeType } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
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

interface ScannerModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Called when the modal is dismissed */
  onClose: () => void;
  /** Called when a code is successfully scanned */
  onScan: (code: ScannedCode) => void;
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

export function ScannerModal({ visible, onClose, onScan }: ScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [torch, setTorch] = useState(false);
  const [scanned, setScanned] = useState(false);

  const isProcessing = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state every time modal opens
  useEffect(() => {
    if (visible) {
      setScanned(false);
      setTorch(false);
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
        onScan({ data, format, type });
        onClose();
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
