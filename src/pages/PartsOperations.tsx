import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Minus, PackagePlus, Plus, ShoppingCart } from 'lucide-react';
import { db } from '../lib/db';
import { adjustStock, commitInventorySale, saveInventoryItem } from '../lib/businessOperations';
import { notifyLocalWrite } from '../lib/sync';
import { useStaff } from '../lib/auth';
import { formatCurrency } from '../lib/utils';
import PageHeader from '../components/PageHeader';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import type { PaymentMethod } from '../types';

export default function PartsOperations() {
  const staff = useStaff();
  const items = useLiveQuery(() => db.inventoryItems.where('business').equals('parts').sortBy('name')) ?? [];
  const customers = useLiveQuery(() => db.customers.orderBy('name').toArray()) ?? [];
  const [form, setForm] = useState({ sku: '', name: '', category: '', sellPrice: '', costPrice: '', stockQty: '', reorderLevel: '2' });
  const [customerId, setCustomerId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash_usd');
  const [message, setMessage] = useState('');

  async function addItem() {
    if (!form.name || !form.sku) return setMessage('SKU and item name are required.');
    await saveInventoryItem({ business: 'parts', sku: form.sku.trim().toUpperCase(), name: form.name.trim(), category: form.category.trim() || 'General', sellPrice: Number(form.sellPrice), costPrice: Number(form.costPrice), stockQty: Number(form.stockQty), reorderLevel: Number(form.reorderLevel), active: true });
    await notifyLocalWrite(); setForm({ sku: '', name: '', category: '', sellPrice: '', costPrice: '', stockQty: '', reorderLevel: '2' }); setMessage('Inventory item added.');
  }

  async function sell(itemId: string) {
    const item = items.find(row => row.id === itemId); if (!item || item.stockQty < 1) return;
    const customer = customers.find(row => row.id === customerId) ?? null;
    await commitInventorySale({ itemId: item.id, customer, staffId: staff.id, paymentMethod });
    await notifyLocalWrite(); setMessage(`${item.name} sold and stock updated.`);
  }

  return <div className="mali-page"><div className="mali-page-inner">
    <PageHeader eyebrow="Mali Parts" title="Inventory & sales counter" description="Control stock and post every customer sale into the shared Mali ledger." />
    {message && <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm font-bold text-brand-800">{message}</div>}
    <section className="grid gap-6 xl:grid-cols-[.7fr_1.3fr]">
      <div className="rounded-2xl border border-ink-200 bg-white p-6 sm:p-7"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-amber-700"><PackagePlus className="h-5 w-5"/></span><div><h2 className="font-black text-ink-950">Add stock item</h2><p className="text-xs text-ink-500">Available offline immediately</p></div></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><Input placeholder="SKU" value={form.sku} onChange={e=>setForm({...form,sku:e.target.value})}/><Input placeholder="Item name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><Input placeholder="Category" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/><Input type="number" placeholder="Selling price" value={form.sellPrice} onChange={e=>setForm({...form,sellPrice:e.target.value})}/><Input type="number" placeholder="Cost price" value={form.costPrice} onChange={e=>setForm({...form,costPrice:e.target.value})}/><Input type="number" placeholder="Opening quantity" value={form.stockQty} onChange={e=>setForm({...form,stockQty:e.target.value})}/></div><Button onClick={addItem} className="mt-5 w-full"><Plus className="h-4 w-4"/> Add to inventory</Button></div>
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white"><div className="flex flex-col gap-3 border-b border-ink-200 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-black text-ink-950">Parts catalogue</h2><p className="mt-1 text-xs text-ink-500">{items.length} products · {items.filter(i=>i.stockQty<=i.reorderLevel).length} need attention</p></div><div className="flex gap-2"><select className="h-10 rounded-xl border border-ink-200 bg-white px-3 text-sm" value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">Walk-in customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><select className="h-10 rounded-xl border border-ink-200 bg-white px-3 text-sm" value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as PaymentMethod)}><option value="cash_usd">Cash</option><option value="ecocash">EcoCash</option><option value="card">Card</option></select></div></div>
        <div className="divide-y divide-ink-100">{items.length === 0 ? <div className="p-12 text-center text-sm text-ink-500">Add your first part to begin.</div> : items.map(item=><div key={item.id} className="grid grid-cols-[1fr_auto] items-center gap-4 p-5"><div><div className="flex items-center gap-2"><h3 className="font-extrabold text-ink-950">{item.name}</h3>{item.stockQty<=item.reorderLevel&&<AlertTriangle className="h-4 w-4 text-amber-600"/>}</div><p className="mt-1 text-xs text-ink-500">{item.sku} · {item.category} · {formatCurrency(item.sellPrice)}</p></div><div className="flex items-center gap-2"><button onClick={()=>adjustStock(item.id,-1).then(notifyLocalWrite)} className="grid h-9 w-9 place-items-center rounded-lg border border-ink-200"><Minus className="h-4 w-4"/></button><span className="min-w-8 text-center font-black">{item.stockQty}</span><button onClick={()=>adjustStock(item.id,1).then(notifyLocalWrite)} className="grid h-9 w-9 place-items-center rounded-lg border border-ink-200"><Plus className="h-4 w-4"/></button><Button onClick={()=>sell(item.id)} disabled={item.stockQty<1} size="sm"><ShoppingCart className="h-4 w-4"/> Sell</Button></div></div>)}</div>
      </div>
    </section>
  </div></div>;
}
