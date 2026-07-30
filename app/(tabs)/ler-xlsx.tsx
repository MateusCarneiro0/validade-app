import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

import { importFromXLSX, type ImportResult } from '@/services/xlsx-parser';

// ---------------------------------------------------------------------------
// LerXLSXScreen
// ---------------------------------------------------------------------------

export default function LerXLSXScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  // ---- Pick & Process ----

  const handlePickFile = async () => {
    try {
      const pickResult = await DocumentPicker.getDocumentAsync({
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        copyToCacheDirectory: true,
      });

      if (pickResult.canceled || !pickResult.assets?.[0]?.uri) {
        return;
      }

      const fileUri = pickResult.assets[0].uri;
      const fileName = pickResult.assets[0].name || 'arquivo.xlsx';

      setLoading(true);
      setError(null);

      const importResult = await importFromXLSX(fileUri);
      setResult(importResult);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido ao processar arquivo.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const dismissResult = () => setResult(null);
  const dismissError = () => setError(null);

  // ---- Render ----

  return (
    <SafeAreaView style={pageStyles.safe}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        contentContainerStyle={pageStyles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={pageStyles.header}>
          <Text style={pageStyles.title}>Importar XLSX</Text>
          <Text style={pageStyles.subtitle}>
            Importe produtos em lote via planilha Excel
          </Text>
        </View>

        {/* Upload button */}
        <Pressable
          style={({ pressed }) => [uploadStyles.button, pressed && uploadStyles.buttonPressed]}
          onPress={handlePickFile}
          disabled={loading}
        >
          <Text style={uploadStyles.icon}>📄</Text>
          <Text style={uploadStyles.title}>Selecionar Arquivo .XLSX</Text>
          <Text style={uploadStyles.subtitle}>Toque para escolher um arquivo</Text>
        </Pressable>

        {/* Loading */}
        {loading && (
          <View style={pageStyles.loadingContainer}>
            <ActivityIndicator size="large" color="#0a7ea4" />
            <Text style={pageStyles.loadingText}>Processando planilha...</Text>
            <Text style={pageStyles.loadingSubtext}>
              Validando dados e consultando API Open Food Facts
            </Text>
          </View>
        )}

        {/* Instructions */}
        <View style={infoStyles.container}>
          <Text style={infoStyles.title}>Colunas Esperadas</Text>
          <Text style={infoStyles.description}>
            A planilha deve conter as seguintes colunas (linha de cabeçalho):
          </Text>

          <View style={infoStyles.table}>
            <InfoRow label="Barcode" required />
            <InfoRow label="Quantidade" required />
            <InfoRow label="Lote" required />
            <InfoRow label="Data de Validade" required hint="Formato: DD/MM/AAAA" />
            <InfoRow label="Nome" />
            <InfoRow label="Imagem" hint="URL da imagem" />
          </View>

          <Text style={infoStyles.note}>
            Se o Nome não for informado, o sistema buscará automaticamente na API
            Open Food Facts usando o código de barras.
          </Text>
        </View>
      </ScrollView>

      {/* Error Modal */}
      <Modal visible={!!error} transparent animationType="fade" onRequestClose={dismissError}>
        <View style={modalStyles.backdrop}>
          <View style={modalStyles.container}>
            <Text style={modalStyles.errorIcon}>❌</Text>
            <Text style={modalStyles.title}>Erro na Importação</Text>
            <Text style={modalStyles.body}>{error}</Text>
            <Pressable
              style={({ pressed }) => [modalStyles.btn, pressed && modalStyles.btnPressed]}
              onPress={dismissError}
            >
              <Text style={modalStyles.btnText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Success/Summary Modal */}
      <Modal visible={!!result} transparent animationType="fade" onRequestClose={dismissResult}>
        <View style={modalStyles.backdrop}>
          <View style={modalStyles.container}>
            <Text style={modalStyles.successIcon}>
              {result && result.ignoredCount === 0 ? '✅' : '⚠️'}
            </Text>
            <Text style={modalStyles.title}>Importação Concluída</Text>

            <View style={modalStyles.statsRow}>
              <View style={[modalStyles.stat, { backgroundColor: '#27ae6015' }]}>
                <Text style={[modalStyles.statValue, { color: '#27ae60' }]}>
                  {result?.successCount ?? 0}
                </Text>
                <Text style={[modalStyles.statLabel, { color: '#27ae60' }]}>
                  Importados
                </Text>
              </View>
              <View style={[modalStyles.stat, { backgroundColor: '#e74c3c15' }]}>
                <Text style={[modalStyles.statValue, { color: '#e74c3c' }]}>
                  {result?.ignoredCount ?? 0}
                </Text>
                <Text style={[modalStyles.statLabel, { color: '#e74c3c' }]}>
                  Ignorados
                </Text>
              </View>
            </View>

            {result && result.ignoredBarcodes.length > 0 && (
              <View style={modalStyles.ignoredList}>
                <Text style={modalStyles.ignoredTitle}>Códigos ignorados:</Text>
                {result.ignoredBarcodes.slice(0, 10).map((bc) => (
                  <Text key={bc} style={modalStyles.ignoredItem}>
                    • {bc}
                  </Text>
                ))}
                {result.ignoredBarcodes.length > 10 && (
                  <Text style={modalStyles.ignoredMore}>
                    ...e mais {result.ignoredBarcodes.length - 10} código(s)
                  </Text>
                )}
              </View>
            )}

            <Pressable
              style={({ pressed }) => [modalStyles.btn, pressed && modalStyles.btnPressed]}
              onPress={dismissResult}
            >
              <Text style={modalStyles.btnText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// InfoRow component
// ---------------------------------------------------------------------------

function InfoRow({ label, required, hint }: { label: string; required?: boolean; hint?: string }) {
  return (
    <View style={infoStyles.row}>
      <View style={infoStyles.rowLeft}>
        <Text style={infoStyles.cellLabel}>{label}</Text>
        {required && <Text style={infoStyles.requiredBadge}>Obrigatório</Text>}
      </View>
      {hint && <Text style={infoStyles.hint}>{hint}</Text>}
    </View>
  );
}

// ===========================================================================
// Styles
// ===========================================================================

const pageStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f5f7' },
  scroll: { paddingHorizontal: 24, paddingBottom: 40 },
  header: { paddingTop: Platform.OS === 'ios' ? 12 : 20, paddingBottom: 20 },
  title: { fontSize: 32, fontWeight: '800', color: '#111', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: '#888', marginTop: 2, fontWeight: '500', lineHeight: 20 },
  loadingContainer: { alignItems: 'center', paddingVertical: 40 },
  loadingText: { fontSize: 17, fontWeight: '700', color: '#333', marginTop: 16 },
  loadingSubtext: { fontSize: 13, color: '#999', marginTop: 4, textAlign: 'center' },
});

const uploadStyles = StyleSheet.create({
  button: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#0a7ea4',
    borderStyle: 'dashed',
    paddingVertical: 40,
    alignItems: 'center',
    marginBottom: 24,
  },
  buttonPressed: { backgroundColor: '#e8f4f8' },
  icon: { fontSize: 48, marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '700', color: '#0a7ea4' },
  subtitle: { fontSize: 13, color: '#888', marginTop: 4 },
});

const infoStyles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  title: { fontSize: 17, fontWeight: '700', color: '#222', marginBottom: 6 },
  description: { fontSize: 13, color: '#888', lineHeight: 18, marginBottom: 14 },
  table: { gap: 2, marginBottom: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cellLabel: { fontSize: 14, fontWeight: '600', color: '#333' },
  requiredBadge: {
    fontSize: 9,
    fontWeight: '700',
    color: '#e74c3c',
    backgroundColor: '#e74c3c15',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  hint: { fontSize: 11, color: '#aaa', fontStyle: 'italic' },
  note: {
    fontSize: 12,
    color: '#999',
    lineHeight: 17,
    backgroundColor: '#f8f8f8',
    padding: 12,
    borderRadius: 8,
  },
});

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  errorIcon: { fontSize: 48, marginBottom: 12 },
  successIcon: { fontSize: 48, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '800', color: '#111', marginBottom: 4, textAlign: 'center' },
  body: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  statsRow: { flexDirection: 'row', gap: 12, marginVertical: 16, width: '100%' },
  stat: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 14,
  },
  statValue: { fontSize: 28, fontWeight: '800' },
  statLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  ignoredList: { width: '100%', marginBottom: 16 },
  ignoredTitle: { fontSize: 13, fontWeight: '700', color: '#e74c3c', marginBottom: 4 },
  ignoredItem: { fontSize: 12, color: '#888', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  ignoredMore: { fontSize: 12, color: '#aaa', fontStyle: 'italic', marginTop: 2 },
  btn: {
    backgroundColor: '#0a7ea4',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 48,
    marginTop: 8,
  },
  btnPressed: { backgroundColor: '#086a8a' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
