import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Boxes, PackagePlus, Printer, ReceiptText, ShoppingCart, TrendingUp } from 'lucide-react';
import { db } from '../lib/db';
import { adjustStock, commitInventorySale, saveInventoryItem } from '../lib/businessOperations';
import { notifyLocalWrite } from '../lib/sync';
import { useStaff } from '../lib/auth';
import { printReceipt } from '../lib/receipt';
import { formatCurrency } from '../lib/utils';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import PageHeader from '../components/PageHeader';
import type { InventoryItem, PaymentMethod, Transaction } from '../types';

const emptyItem = { sku: '', name: '', category: '', sellPrice: '', costPrice: '', openingStock: '', reorderLevel: '2' };

export default function PartsOperations() {
  const staff = useStaff();
  const items = useLiveQuery(() => db.inventoryItems.where('business').equals('parts').toArray(), []) ?? [];
  const customers = useLiveQuery(() => db.customers.orderBy('name').toArray(), []) ?? [];
  const movements = useLiveQuery(() => db.inventoryMovements.where('business').equals('parts').reverse().sortBy('createdAt'), []) ?? [];
  const [form, setForm] = useState(emptyItem);
  const [customerId, setCustomerId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash_usd');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [redeemPoints, setRedeemPoints] = useState('0');
  const [stockAction, setStockAction] = useState({ itemId: '', qty: '', reason: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [lastSale, setLastSale] = useState<Transaction | null>(null);

  const stockValue = useMemo(() => items.reduce((sum, item) => sum + item.costPrice * item.stockQty, 0), [items]);
  const lowStock = items.filter(item => item.stockQty <= item.reorderLevel);
  const selectedCustomer = customers.find(customer => customer.id === customerId) ?? null;

  async function run(key: string, operation: () => Promise<void>) {
    setBusy(key); setError('');
    try { await operation(); await notifyLocalWrite(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The operation failed'); }
    finally { setBusy(''); }
  }

  function addItem() {
    return run('add', async () => {
      await saveInventoryItem({
        business: 'parts', sku: form.sku, name: form.name, category: form.category.trim() || 'General',
        sellPrice: Number(form.sellPrice), costPrice: Number(form.costPrice), stockQty: Number(form.openingStock),
        reorderLevel: Number(form.reorderLevel), active: true
      });
      setForm(emptyItem);
    });
  }

  function sell(item: InventoryItem) {
    return run(`sale-${item.id}`, async () => {
      const transaction = await commitInventorySale({
        itemId: item.id, quantity: Number(quantities[item.id] || 1), customer: selectedCustomer,
        staffId: staff.id, paymentMethod, redeemPoints: Number(redeemPoints || 0)
      });
      setLastSale(transaction);
      setQuantities(current => ({ ...current, [item.id]: '1' }));
      setRedeemPoints('0');
    });
  }

  function receiveStock() {
    return run('stock', async () => {
      const qty = Math.floor(Number(stockAction.qty));
      if (!stockAction.itemId) throw new Error('Choose an inventory item');
      if (qty < 1) throw new Error('Received quantity must be at least one');
      if (!stockAction.reason.trim()) throw new Error('Enter the supplier, delivery note or adjustment reason');
      await db.transaction('rw', db.inventoryItems, db.inventoryMovements, async () => {
        await adjustStock(stockAction.itemId, qty, stockAction.reason, staff.id, 'receive');
      });
      setStockAction({ itemId: '', qty: '', reason: '' });
    });
  }

  return (
    <div className="mali-page"><div className="mali-page-inner max-w-[96rem]">
      <PageHeader eyebrow="Mali Parts" title="Parts counter & stock control" description="Sell accurately, protect margin and keep a complete stock movement trail—even when the connection drops." />

      {error && <div className="mb-5 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800"><AlertTriangle className="h-5 w-5" />{error}</div>}
      {lastSale && <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center"><ReceiptText className="h-5 w-5 text-emerald-700" /><div className="flex-1"><b>Sale completed:</b> {formatCurrency(lastSale.amount)} · {lastSale.pointsEarned} points earned</div><Button size="sm" variant="outline" onClick={() => printReceipt(lastSale, selectedCustomer)}><Printer className="h-4 w-4" /> Receipt</Button></div>}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-ink-200 bg-white p-5"><p className="text-xs font-bold uppercase tracking-wider text-ink-500">Stock at cost</p><p className="mt-2 text-3xl font-black">{formatCurrency(stockValue)}</p></div>
        <div className="rounded-2xl border border-ink-200 bg-white p-5"><p className="text-xs font-bold uppercase tracking-wider text-ink-500">Products</p><p className="mt-2 text-3xl font-black">{items.length}</p></div>
        <div className={`rounded-2xl border p-5 ${lowStock.length ? 'border-amber-200 bg-amber-50' : 'border-ink-200 bg-white'}`}><p className="text-xs font-bold uppercase tracking-wider text-ink-500">Reorder alerts</p><p className="mt-2 text-3xl font-black">{lowStock.length}</p></div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[.72fr_1.28fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-ink-200 bg-white p-6"><div className="flex items-center gap-3"><PackagePlus className="h-5 w-5 text-brand-700"/><h2 className="font-black">Add catalogue item</h2></div><div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Input placeholder="SKU" value={form.sku} onChange={e => setForm({...form, sku:e.target.value.toUpperCase()})}/><Input placeholder="Part name" value={form.name} onChange={e => setForm({...form,name:e.target.value})}/><Input placeholder="Category" value={form.category} onChange={e => setForm({...form,category:e.target.value})}/><Input type="number" min="0" step="0.01" placeholder="Selling price" value={form.sellPrice} onChange={e => setForm({...form,sellPrice:e.target.value})}/><Input type="number" min="0" step="0.01" placeholder="Cost price" value={form.costPrice} onChange={e => setForm({...form,costPrice:e.target.value})}/><Input type="number" min="0" step="1" placeholder="Opening stock" value={form.openingStock} onChange={e => setForm({...form,openingStock:e.target.value})}/><Input type="number" min="0" step="1" placeholder="Reorder at" value={form.reorderLevel} onChange={e => setForm({...form,reorderLevel:e.target.value})}/><Button disabled={busy==='add'} onClick={addItem}>{busy==='add'?'Saving…':'Add item'}</Button>
          </div></div>

          <div className="rounded-2xl border border-ink-200 bg-white p-6"><div className="flex items-center gap-3"><Boxes className="h-5 w-5 text-brand-700"/><h2 className="font-black">Receive stock</h2></div><div className="mt-5 space-y-3"><select className="h-12 w-full rounded-xl border-2 border-ink-200 bg-white px-3" value={stockAction.itemId} onChange={e=>setStockAction({...stockAction,itemId:e.target.value})}><option value="">Choose item</option>{items.map(item=><option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}</select><Input type="number" min="1" step="1" placeholder="Quantity received" value={stockAction.qty} onChange={e=>setStockAction({...stockAction,qty:e.target.value})}/><Input placeholder="Supplier / delivery note / reason" value={stockAction.reason} onChange={e=>setStockAction({...stockAction,reason:e.target.value})}/><Button className="w-full" disabled={busy==='stock'} onClick={receiveStock}>Post receipt</Button></div></div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
          <div className="border-b border-ink-200 p-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-end"><div className="flex-1"><p className="text-xs font-bold uppercase text-ink-500">Customer</p><select className="mt-1 h-11 w-full rounded-xl border border-ink-200 px-3" value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">Walk-in (no points)</option>{customers.map(customer=><option key={customer.id} value={customer.id}>{customer.name} · {customer.pointsBalance} pts</option>)}</select></div><div><p className="text-xs font-bold uppercase text-ink-500">Payment</p><select className="mt-1 h-11 rounded-xl border border-ink-200 px-3" value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as PaymentMethod)}><option value="cash_usd">Cash</option><option value="ecocash">EcoCash</option><option value="card">Card</option></select></div><div><p className="text-xs font-bold uppercase text-ink-500">Redeem points</p><Input className="mt-1 w-36" type="number" min="0" step="1" disabled={!selectedCustomer} value={redeemPoints} onChange={e=>setRedeemPoints(e.target.value)}/></div></div></div>
          <div className="divide-y divide-ink-100">{items.length===0?<div className="p-12 text-center text-sm text-ink-500">Add your first part to start selling.</div>:items.map(item=>{
            const margin=item.sellPrice-item.costPrice; return <div key={item.id} className="grid gap-3 p-5 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><div className="flex items-center gap-2"><h3 className="font-extrabold">{item.name}</h3>{item.stockQty<=item.reorderLevel&&<span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">REORDER</span>}</div><p className="mt-1 text-xs text-ink-500">{item.sku} · {item.category} · margin {formatCurrency(margin)}</p><p className="mt-2 text-sm font-bold">{item.stockQty} in stock · {formatCurrency(item.sellPrice)}</p></div><Input className="w-24" type="number" min="1" max={item.stockQty} step="1" value={quantities[item.id]??'1'} onChange={e=>setQuantities({...quantities,[item.id]:e.target.value})}/><Button disabled={item.stockQty<1||busy===`sale-${item.id}`} onClick={()=>sell(item)}><ShoppingCart className="h-4 w-4"/>{busy===`sale-${item.id}`?'Posting…':'Sell'}</Button></div>
          })}</div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-ink-200 bg-white p-6"><div className="flex items-center gap-3"><TrendingUp className="h-5 w-5 text-brand-700"/><h2 className="font-black">Latest stock movements</h2></div><div className="mt-4 divide-y divide-ink-100">{movements.slice(0,8).map(move=>{const item=items.find(row=>row.id===move.itemId);return <div key={move.id} className="flex items-center justify-between gap-4 py-3 text-sm"><div><b>{item?.name??'Inventory item'}</b><p className="text-xs text-ink-500">{move.reason} · {new Date(move.createdAt).toLocaleString('en-GB')}</p></div><span className={`font-black ${move.qtyDelta>0?'text-emerald-700':'text-red-600'}`}>{move.qtyDelta>0?'+':''}{move.qtyDelta}</span></div>})}{movements.length===0&&<p className="py-6 text-center text-sm text-ink-500">No movements recorded yet.</p>}</div></section>
    </div></div>
  );
}
