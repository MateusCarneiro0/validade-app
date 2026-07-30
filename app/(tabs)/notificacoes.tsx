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

import {
  getNotificationHistory,
  markAsRead,
  markAllAsRead,
  clearHistory,
  type NotificationEvent,
} from '@/services/notification-history';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(isoDate: string): string {
  const now = new Date();
  const date = new Date(isoDate);
  const diffMs = now.getTime() - date.getTime();

  // Guard against future dates or invalid dates
  if (diffMs < 0) return 'Agora mesmo';

  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return 'Agora mesmo';
  if (diffMin < 60) return `Há ${diffMin} min`;
  if (diffHour < 24) return `Há ${diffHour} h`;
  if (diffDay < 7) return `Há ${diffDay} d`;
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}


// ---------------------------------------------------------------------------
// NotificacoesScreen
// ---------------------------------------------------------------------------

export default function NotificacoesScreen() {
  const [history, setHistory] = useState<NotificationEvent[]>([]);

  // ---- Load ----

  const loadHistory = useCallback(async () => {
    const data = await getNotificationHistory();
    setHistory(data);
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Refresh when screen comes into focus
  useEffect(() => {
    const interval = setInterval(loadHistory, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, [loadHistory]);

  // ---- Handlers ----

  const handlePress = useCallback(
    async (event: NotificationEvent) => {
      if (!event.read) {
        await markAsRead(event.id);
        await loadHistory();
      }
    },
    [loadHistory],
  );

  const handleMarkAllRead = useCallback(async () => {
    await markAllAsRead();
    await loadHistory();
  }, [loadHistory]);

  const handleClear = useCallback(() => {
    if (history.length === 0) return;
    Alert.alert('Limpar Histórico', 'Tem certeza que deseja limpar todo o histórico de notificações?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Limpar',
        style: 'destructive',
        onPress: async () => {
          await clearHistory();
          await loadHistory();
        },
      },
    ]);
  }, [history, loadHistory]);

  // ---- Render item ----

  const renderItem = ({ item }: { item: NotificationEvent }) => {
    const daysText = item.daysBefore === 0
      ? 'Vence hoje'
      : item.daysBefore != null
        ? `${item.daysBefore} dias antes`
        : '';

    return (
      <Pressable
        style={({ pressed }) => [
          itemStyles.card,
          !item.read && itemStyles.cardUnread,
          pressed && itemStyles.cardPressed,
        ]}
        onPress={() => handlePress(item)}
      >
        {/* Unread dot */}
        {!item.read && <View style={itemStyles.unreadDot} />}

        <View style={itemStyles.content}>
          <Text style={[itemStyles.title, !item.read && itemStyles.titleUnread]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={itemStyles.body} numberOfLines={2}>
            {item.body}
          </Text>
          <View style={itemStyles.meta}>
            {daysText ? (
              <View style={itemStyles.daysBadge}>
                <Text style={itemStyles.daysText}>{daysText}</Text>
              </View>
            ) : null}
            <Text style={itemStyles.time}>{formatRelativeTime(item.receivedAt)}</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  // ---- Empty ----

  const renderEmpty = () => (
    <View style={emptyStyles.container}>
      <Text style={emptyStyles.icon}>🔔</Text>
      <Text style={emptyStyles.title}>Nenhuma notificação</Text>
      <Text style={emptyStyles.subtitle}>
        As notificações de vencimento{'\n'}aparecerão aqui automaticamente
      </Text>
    </View>
  );

  // ---- Summary ----

  const unreadCount = history.filter((e) => !e.read).length;

  // ---- Main ----

  return (
    <SafeAreaView style={pageStyles.safe}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={pageStyles.header}>
        <View>
          <Text style={pageStyles.title}>Notificações</Text>
          <Text style={pageStyles.subtitle}>
            {history.length} {history.length === 1 ? 'notificação' : 'notificações'}
            {unreadCount > 0 && ` • ${unreadCount} não lida(s)`}
          </Text>
        </View>

        <View style={pageStyles.headerActions}>
          {unreadCount > 0 && (
            <Pressable onPress={handleMarkAllRead} hitSlop={8}>
              <Text style={pageStyles.actionText}>Ler todas</Text>
            </Pressable>
          )}
          {history.length > 0 && (
            <Pressable onPress={handleClear} hitSlop={8}>
              <Text style={pageStyles.actionTextDanger}>Limpar</Text>
            </Pressable>
          )}
        </View>
      </View>

      {history.length === 0 ? (
        <FlatList
          data={[]}
          renderItem={() => null}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={pageStyles.emptyContainer}
          onRefresh={loadHistory}
          refreshing={false}
        />
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={pageStyles.listContainer}
          showsVerticalScrollIndicator={false}
          onRefresh={loadHistory}
          refreshing={false}
        />
      )}
    </SafeAreaView>
  );
}

// ===========================================================================
// Styles
// ===========================================================================

const pageStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f5f7' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 12 : 20,
    paddingBottom: 12,
  },
  title: { fontSize: 32, fontWeight: '800', color: '#111', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: '#888', marginTop: 2, fontWeight: '500' },
  headerActions: { flexDirection: 'row', gap: 12, marginTop: 6 },
  actionText: { fontSize: 14, color: '#0a7ea4', fontWeight: '600' },
  actionTextDanger: { fontSize: 14, color: '#e74c3c', fontWeight: '600' },
  listContainer: { paddingHorizontal: 16, paddingBottom: 30 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});

const itemStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardUnread: {
    backgroundColor: '#f0f8ff',
    borderLeftWidth: 3,
    borderLeftColor: '#0a7ea4',
  },
  cardPressed: { opacity: 0.85 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0a7ea4',
    marginTop: 6,
    marginRight: 10,
  },
  content: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600', color: '#333', marginBottom: 4 },
  titleUnread: { fontWeight: '800', color: '#111' },
  body: { fontSize: 13, color: '#666', lineHeight: 18 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  daysBadge: {
    backgroundColor: '#e8f4f8',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  daysText: { fontSize: 10, fontWeight: '700', color: '#0a7ea4' },
  time: { fontSize: 11, color: '#aaa', fontWeight: '500' },
});

const emptyStyles = StyleSheet.create({
  container: { alignItems: 'center', paddingHorizontal: 40 },
  icon: { fontSize: 72, marginBottom: 20, opacity: 0.6 },
  title: { fontSize: 20, fontWeight: '700', color: '#333', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 15, color: '#999', textAlign: 'center', lineHeight: 22 },
});
