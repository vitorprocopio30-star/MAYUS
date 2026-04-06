const fs = require('fs');
const path = require('path');

const pagePath = path.join(__dirname, 'src', 'components', 'layout', 'AdminHeader.tsx');
let content = fs.readFileSync(pagePath, 'utf8');

// Handle imports insertion
if (!content.includes('import { useNotifications }')) {
    content = content.replace(
        'import { useUserProfile } from "@/hooks/useUserProfile";',
        'import { useUserProfile } from "@/hooks/useUserProfile";\nimport { useNotifications } from "@/hooks/useNotifications";\nimport Link from "next/link";'
    );
}

// Extract the component code
const headerStart = content.indexOf('export function AdminHeader() {');
const hooksPos = content.indexOf('const handleLogout =', headerStart);

if (!content.includes('const [notifications, setNotifications] = useState<any[]>([])')) {
    const hooksCode = `
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Hook Ativo: Realtime WebSocket (apenas ativa se logado)
  useNotifications(profile?.id, profile?.tenant_id);

  useEffect(() => {
    if (!profile?.tenant_id) return;
    
    // Busca inicial de histórico
    async function fetchNotifications() {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('tenant_id', profile!.tenant_id)
        .or('user_id.eq.' + profile!.id + ',user_id.is.null')
        .order('created_at', { ascending: false })
        .limit(20);
        
      if (data) {
        setNotifications(data);
        setUnreadCount(data.filter(n => !n.is_read).length);
      }
    }
    fetchNotifications();

    // Listener para o evento customizado disparado pelo Hook para atualizar na hora
    const handleNewNotif = (e: any) => {
      const newNotif = e.detail;
      setNotifications(prev => [newNotif, ...prev]);
      setUnreadCount(prev => prev + 1);
    };

    window.addEventListener('new-notification', handleNewNotif);
    return () => window.removeEventListener('new-notification', handleNewNotif);
  }, [profile?.id, profile?.tenant_id, supabase]);

  const markAllAsRead = async () => {
    if (!profile?.tenant_id || unreadCount === 0) return;
    setUnreadCount(0);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    
    await supabase.from('notifications')
      .update({ is_read: true })
      .eq('tenant_id', profile.tenant_id)
      .eq('is_read', false)
      .or('user_id.eq.' + profile!.id + ',user_id.is.null');
  };
`;
    content = content.substring(0, hooksPos) + hooksCode + '\n  ' + content.substring(hooksPos);
}

// Hook Notification Bell
const bellStart = content.indexOf(' {/* Notifications */}');
const bellEnd = content.indexOf('<div className="h-8 w-px', bellStart);
const newBellUI = `{/* Notifications */}
        <div className="relative">
          <button 
            onClick={() => { setNotifOpen(!notifOpen); setProfileOpen(false); }}
            className="relative p-2 rounded-full hover:bg-gray-100 dark:hover:bg-[#1a1a1a] transition-colors"
          >
            <Bell size={20} className="text-gray-600 dark:text-gray-300" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white dark:border-[#0C0C0C] text-[8px] flex items-center justify-center text-white font-bold animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Modal Dropdown Notifications */}
          {notifOpen && (
            <div className="absolute right-0 mt-3 w-80 max-h-96 md:w-96 bg-white dark:bg-[#111111] rounded-xl shadow-xl border border-gray-100 dark:border-[#222] overflow-hidden flex flex-col z-50 animate-fade-in-up" style={{ animationDuration: '0.15s' }}>
              <div className="p-4 border-b border-gray-100 dark:border-[#222] flex items-center justify-between bg-[#0a0a0a]">
                <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                  Notificações do Sistema {unreadCount > 0 && <span className="bg-[#CCA761] text-black px-2 py-0.5 rounded-full text-xs">{unreadCount}</span>}
                </h3>
                {unreadCount > 0 && (
                  <button onClick={markAllAsRead} className="text-xs text-[#CCA761] hover:underline font-semibold">Marcar lidas</button>
                )}
              </div>
              <div className="overflow-y-auto flex-1 p-2 space-y-1 bg-[#0f0f0f] min-h-[100px] max-h-[300px]">
                {notifications.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 text-sm">Nenhuma aba invisível, você está em dia.</div>
                ) : (
                  notifications.map(n => (
                    <div key={n.id} className={\`p-3 rounded-lg flex items-start gap-3 transition-colors \${!n.is_read ? 'bg-white/5 border border-white/5' : 'hover:bg-white/[0.02]'}\`}>
                      <div className={\`mt-1 w-2 h-2 rounded-full shrink-0 \${n.type === 'success' ? 'bg-green-500' : n.type === 'alert' ? 'bg-red-500' : 'bg-[#CCA761]'}\`} />
                      <div className="flex-1 min-w-0">
                        <p className={\`text-sm font-semibold truncate \${!n.is_read ? 'text-white' : 'text-gray-400'}\`}>{n.title}</p>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{n.message}</p>
                        {n.link_url && (
                          <Link href={n.link_url} onClick={() => setNotifOpen(false)} className="text-xs text-[#CCA761] hover:underline mt-2 inline-block font-medium">Ver detalhes &rarr;</Link>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        `;

content = content.replace(content.substring(bellStart, bellEnd), newBellUI);

// Fix bug: opening profile should close notif
content = content.replace('onClick={() => setProfileOpen(!profileOpen)}', 'onClick={() => { setProfileOpen(!profileOpen); setNotifOpen(false); }}');

fs.writeFileSync(pagePath, content);
console.log("Header patched!");
