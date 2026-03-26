'use client';
import { useState, useEffect, useCallback } from 'react';
import { OrderData } from '@/components/order-modal';
import { isUserAdmin, getUserUnit } from '@/components/unit-selector';

function getUserInfo() {
  try {
    const stored = localStorage.getItem('virtuosa_user');
    if (stored) {
      const user = JSON.parse(stored);
      return { userName: user.name || 'Alguém', userId: user.id || '', userUnit: user.unit || 'SBC' };
    }
  } catch {}
  return { userName: 'Alguém', userId: '', userUnit: 'SBC' };
}

async function subscribeToPush() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (Notification.permission === 'default') await Notification.requestPermission();
    if (Notification.permission !== 'granted') return;
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) return;
      const urlBase64ToUint8Array = (base64String: string) => {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        return new Uint8Array([...rawData].map(c => c.charCodeAt(0)));
      };
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) });
    }
    const { userName, userId } = getUserInfo();
    await fetch('/api/push/subscribe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON(), userId, userName }),
    });
  } catch (err) { console.error('Push subscription error:', err); }
}

export function useOrders() {
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [urgencyFilter, setUrgencyFilter] = useState('All');
  const [selectedUnit, setSelectedUnit] = useState(() => isUserAdmin() ? 'all' : getUserUnit());
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<OrderData | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<string | null>(null);
  const [showPrices, setShowPrices] = useState(false);

  useEffect(() => { subscribeToPush(); }, []);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (statusFilter !== 'All') params.append('status', statusFilter);
      if (urgencyFilter !== 'All') params.append('urgency', urgencyFilter);
      if (selectedUnit !== 'all') params.append('unit', selectedUnit);
      if (dateFrom) params.append('dateFrom', dateFrom);
      if (dateTo) params.append('dateTo', dateTo);
      const res = await fetch(`/api/orders?${params.toString()}`);
      if (res.ok) setOrders(await res.json());
    } catch (err) { console.error('Fetch orders error:', err); }
    finally { setLoading(false); }
  }, [searchQuery, statusFilter, urgencyFilter, selectedUnit, dateFrom, dateTo]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const handleSaveOrder = async (orderData: Omit<OrderData, 'id' | 'status'>[]) => {
    const { userName, userId, userUnit } = getUserInfo();
    try {
      if (editingOrder?.id) {
        const res = await fetch('/api/orders', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingOrder.id, ...orderData[0], userName, userId }) });
        if (res.ok) { setIsModalOpen(false); fetchOrders(); }
      } else {
        const res = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: orderData, userName, userId, userUnit }) });
        if (res.ok) { setIsModalOpen(false); fetchOrders(); }
      }
    } catch (err) { console.error('Save order error:', err); }
  };

  const handleDeleteOrder = (id: string) => setOrderToDelete(id);

  const confirmDeleteOrder = async () => {
    if (!orderToDelete) return;
    try {
      const res = await fetch(`/api/orders?id=${orderToDelete}`, { method: 'DELETE' });
      if (res.ok) { fetchOrders(); setOrderToDelete(null); }
    } catch (err) { console.error('Delete order error:', err); }
  };

  const handleStatusChange = async (id: string, newStatus: string, estimatedArrival?: string) => {
    const { userName, userId } = getUserInfo();
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus, estimatedArrival: estimatedArrival || o.estimatedArrival } : o));
    try {
      await fetch('/api/orders', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: newStatus, estimatedArrival: estimatedArrival || undefined, userName, userId }) });
    } catch { fetchOrders(); }
  };

  const openCreateModal = () => { setEditingOrder(null); setIsModalOpen(true); };
  const openEditModal = (order: OrderData) => { setEditingOrder(order); setIsModalOpen(true); };

  // KPI computations
  const totalOrders = orders.length;
  const totalSpent = orders.filter(o => o.totalPrice).reduce((s, o) => s + (o.totalPrice || 0), 0);
  const avgPrice = totalOrders > 0 ? totalSpent / totalOrders : 0;
  const aguardando = orders.filter(o => o.status === 'Aguardando').length;
  const entregues = orders.filter(o => o.status === 'Entregue').length;

  return {
    orders, loading, searchQuery, setSearchQuery, statusFilter, setStatusFilter,
    urgencyFilter, setUrgencyFilter, selectedUnit, setSelectedUnit,
    dateFrom, setDateFrom, dateTo, setDateTo,
    isModalOpen, setIsModalOpen, editingOrder, orderToDelete, setOrderToDelete,
    showPrices, setShowPrices, handleSaveOrder, handleDeleteOrder, confirmDeleteOrder,
    handleStatusChange, openCreateModal, openEditModal,
    totalOrders, totalSpent, avgPrice, aguardando, entregues,
  };
}
