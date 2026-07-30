import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { formatCurrency, generateReferralCode } from '../lib/utils';
import { Search, UserPlus, Check, X, CreditCard, Banknote, Smartphone, Minus, Plus as PlusIcon, Trash2 } from 'lucide-react';
import type { Customer, PaymentMethod, LineItem } from '../types';

export default function POS() {
  const [searchPhone, setSearchPhone] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [cart, setCart] = useState<{service: any, qty: number}[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash_usd');
  
  const [isNewCustomerModal, setIsNewCustomerModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', vehicleMakeModel: '', referredByCode: '' });

  const settings = useLiveQuery(() => db.settings.get('global'));
  
  // Search for customer as they type
  useEffect(() => {
    if (searchPhone.length > 5) {
      db.customers.where('phone').startsWithIgnoreCase(searchPhone).first().then(customer => {
        if (customer) {
          setSelectedCustomer(customer);
          setIsAnonymous(false);
        } else {
          setSelectedCustomer(null);
          setIsAnonymous(true);
        }
      });
    } else {
      setSelectedCustomer(null);
      setIsAnonymous(true);
    }
  }, [searchPhone]);

  const addToCart = (service: any) => {
    const existing = cart.find(i => i.service.id === service.id);
    if (existing) {
      setCart(cart.map(i => i.service.id === service.id ? {...i, qty: i.qty + 1} : i));
    } else {
      setCart([...cart, {service, qty: 1}]);
    }
  };

  const updateCartQty = (serviceId: string, delta: number) => {
    setCart(cart.map(i => {
      if (i.service.id === serviceId) {
        return {...i, qty: i.qty + delta};
      }
      return i;
    }).filter(i => i.qty > 0));
  };

  const handleProcessTransaction = async () => {
    if (cart.length === 0 || !settings) return;
    
    const transactionId = uuidv4();
    let totalAmount = 0;
    let pointsEarned = 0;
    
    const hasMembership = selectedCustomer?.tags?.includes('wash_member') || false; // Using generic tag for now
    
    const lineItems: LineItem[] = [];
    
    for (const item of cart) {
      const isCoveredService = hasMembership && item.service.type === 'wash'; // Simple logic: members get washes free (or we can customize)
      
      let itemTotal = item.service.price * item.qty;
      if (isCoveredService) {
        itemTotal = 0;
      }
      
      lineItems.push({
        description: item.service.name,
        qty: item.qty,
        unitPrice: item.service.price,
        total: itemTotal
      });
      totalAmount += itemTotal;
    }
    
    if (totalAmount > 0) {
      // 1 point per dollar spent + base points
      pointsEarned = Math.floor(totalAmount) + settings.pointsPerWash;
    }

    // Save transaction
    await db.transactions.add({
      id: transactionId,
      business: 'wash',
      customerId: selectedCustomer?.id || null,
      customerPhone: selectedCustomer?.phone || searchPhone || null,
      lineItems,
      businessMeta: { serviceTypes: cart.map(i => i.service.id).join(','), serviceType: cart[0]?.service?.id || 'mixed' },
      amount: totalAmount,
      paymentMethod,
      pointsEarned,
      pointsRedeemed: 0,
      staffId: 'staff-1', // TODO: Get from auth
      shiftId: 'shift-1', // TODO: Get active shift
      status: 'completed',
      createdAt: Date.now(),
      syncStatus: 'pending_sync'
    });

    // Update customer points
    if (selectedCustomer && pointsEarned > 0) {
      await db.pointsLedger.add({
        id: uuidv4(),
        customerId: selectedCustomer.id,
        business: 'wash',
        type: 'earn',
        points: pointsEarned,
        transactionId: transactionId,
        reason: `Earned from transaction`,
        createdAt: Date.now(),
        syncStatus: 'pending_sync'
      });
      await db.customers.update(selectedCustomer.id, {
        pointsBalance: (selectedCustomer.pointsBalance || 0) + pointsEarned,
        updatedAt: Date.now(),
        syncStatus: 'pending_sync'
      });
    }

    // Reset UI
    setSearchPhone('');
    setSelectedCustomer(null);
    setIsAnonymous(true);
    setCart([]);
    setPaymentMethod('cash_usd');
    
    alert('Transaction Successful!');
  };

  const handleCreateCustomer = async (e: import("react").FormEvent) => {
    e.preventDefault();
    const id = uuidv4();
    const newCust: Customer = {
      id,
      name: newCustomer.name,
      phone: newCustomer.phone,
      vehicles: newCustomer.vehicleMakeModel ? [{ reg: '', makeModel: newCustomer.vehicleMakeModel }] : [],
      pointsBalance: 0,
      referralCode: generateReferralCode(),
      referredByCode: newCustomer.referredByCode || null,
      tags: [],
      createdByBusiness: 'wash',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      syncStatus: 'pending_sync'
    };
    await db.customers.add(newCust);
    setSelectedCustomer(newCust);
    setIsAnonymous(false);
    setSearchPhone(newCust.phone);
    setIsNewCustomerModal(false);
    setNewCustomer({ name: '', phone: '', vehicleMakeModel: '', referredByCode: '' });
  };

  if (!settings) return <div className="p-8 text-center text-slate-500">Loading settings...</div>;

  const hasMembership = selectedCustomer?.tags?.includes('wash_member') || false;

  return (
    <div className="flex flex-col lg:flex-row h-full w-full bg-slate-100 overflow-hidden">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col p-6 overflow-y-auto">
        
        {/* Customer Search Section */}
        <div className="mb-6 flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input 
              type="tel"
              placeholder="Enter customer phone (e.g. +263...)" 
              className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-slate-200 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20 text-lg shadow-sm outline-none transition-all font-medium"
              value={searchPhone}
              onChange={e => setSearchPhone(e.target.value)}
            />
          </div>
          <button 
            className="w-full sm:w-auto px-6 py-3 bg-[#004D4D] hover:bg-teal-900 text-white font-bold rounded-lg shadow-md flex items-center justify-center gap-2 transition-colors"
            onClick={() => {
              setNewCustomer({...newCustomer, phone: searchPhone});
              setIsNewCustomerModal(true);
            }}
          >
            <UserPlus className="w-5 h-5" />
            NEW CUSTOMER
          </button>
        </div>

        {/* Services Grid */}
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-4">Select Services</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {settings.services.map(service => (
              <button 
                key={service.id}
                onClick={() => addToCart(service)}
                className="bg-white p-4 rounded-xl shadow-sm border-2 border-slate-100 hover:border-teal-500 hover:shadow-md transition-all text-left flex flex-col h-32 active:scale-95"
              >
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">{service.type.replace('_', ' ')}</span>
                <span className="font-bold text-slate-800 text-lg leading-tight mb-auto">{service.name}</span>
                <span className="text-teal-700 font-black text-xl">{formatCurrency(service.price)}</span>
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* Right Sidebar - Checkout */}
      <aside className="w-full lg:w-[400px] bg-white border-l border-slate-200 flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.02)] z-10 shrink-0">
        {/* Customer Identity Bar */}
        <div className={`p-6 border-b-2 ${isAnonymous ? 'bg-slate-50 border-slate-200' : 'bg-teal-50 border-teal-200'}`}>
          {isAnonymous ? (
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-400">
                <Search className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-700">Anonymous Walk-in</h3>
                <p className="text-slate-500 text-sm">Search phone to attach customer</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold text-lg shadow-inner">
                  {selectedCustomer?.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-teal-900 leading-tight">{selectedCustomer?.name}</h3>
                  <div className="flex gap-2 items-center">
                    <p className="text-teal-700 text-sm font-medium">{selectedCustomer?.pointsBalance} pts</p>
                    {hasMembership && (
                      <span className="bg-teal-200 text-teal-800 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">Member</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <h4 className="text-xs uppercase text-teal-600/70 font-bold mb-0.5">Vehicle</h4>
                <p className="text-teal-900 text-sm font-semibold truncate max-w-[100px]">{selectedCustomer?.vehicles?.[0]?.makeModel || 'N/A'}</p>
              </div>
            </div>
          )}
        </div>

        {/* Cart Summary */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-6 pb-2">
            <h2 className="text-sm font-black text-slate-500 uppercase tracking-widest flex justify-between items-center">
              <span>Cart Summary</span>
              {cart.length > 0 && (
                <button onClick={() => setCart([])} className="text-red-400 hover:text-red-600 flex items-center gap-1 text-xs">
                  <Trash2 className="w-3 h-3" /> Clear
                </button>
              )}
            </h2>
          </div>
          
          <div className="flex-1 overflow-y-auto px-6 space-y-4 pb-6">
            {cart.length === 0 ? (
              <div className="text-slate-400 italic text-sm py-8 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">
                Cart is empty.<br/>Select services to add.
              </div>
            ) : (
              cart.map((item) => {
                const isCovered = hasMembership && item.service.type === 'wash';
                return (
                  <div key={item.service.id} className="flex flex-col gap-2 p-3 bg-slate-50 border border-slate-100 rounded-lg">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-slate-800 leading-tight">{item.service.name}</p>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">{item.service.type}</p>
                      </div>
                      <div className="text-right">
                        <span className="font-bold">{formatCurrency(item.service.price * item.qty)}</span>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center mt-2">
                      <div className="flex items-center gap-2 bg-white rounded-md border border-slate-200">
                        <button onClick={() => updateCartQty(item.service.id, -1)} className="p-1 text-slate-500 hover:text-slate-800">
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="text-sm font-bold w-4 text-center">{item.qty}</span>
                        <button onClick={() => updateCartQty(item.service.id, 1)} className="p-1 text-slate-500 hover:text-slate-800">
                          <PlusIcon className="w-4 h-4" />
                        </button>
                      </div>
                      {isCovered && (
                        <div className="flex items-center gap-1 bg-teal-100 text-teal-800 px-2 py-1 rounded text-xs font-bold">
                          <Check className="w-3 h-3" /> Covered
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Totals & Payment */}
          <div className="p-6 bg-slate-50 border-t border-slate-200 mt-auto">
            {(() => {
              let subtotal = 0;
              let discount = 0;
              
              cart.forEach(item => {
                const isCovered = hasMembership && item.service.type === 'wash';
                const itemTotal = item.service.price * item.qty;
                subtotal += itemTotal;
                if (isCovered) discount += itemTotal;
              });
              
              const total = subtotal - discount;

              return (
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between items-center text-slate-500 text-sm font-medium">
                    <span>Subtotal</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between items-center text-teal-600 text-sm font-bold">
                      <span>Member Discount</span>
                      <span>-{formatCurrency(discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-2xl font-black pt-2 border-t border-slate-200">
                    <span>TOTAL</span>
                    <span className={total === 0 && cart.length > 0 ? "text-teal-600" : ""}>{formatCurrency(total)}</span>
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { id: 'cash_usd', label: 'CASH' },
                { id: 'ecocash', label: 'ECOCASH' },
                { id: 'card', label: 'CARD' },
              ].map(method => {
                const isActive = paymentMethod === method.id;
                return (
                  <button 
                    key={method.id}
                    onClick={() => setPaymentMethod(method.id as PaymentMethod)}
                    className={`flex flex-col items-center justify-center py-3 rounded-xl border-2 font-bold text-[10px] sm:text-xs gap-1 transition-colors ${
                      isActive 
                        ? 'bg-teal-50 border-teal-500 text-teal-700' 
                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-600'
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-teal-500' : 'bg-slate-400'}`}></div>
                    {method.label}
                  </button>
                )
              })}
            </div>
            
            <button 
              disabled={cart.length === 0}
              onClick={handleProcessTransaction}
              className="w-full py-4 bg-[#004D4D] disabled:opacity-50 disabled:active:scale-100 text-white font-black text-lg rounded-xl shadow-lg shadow-teal-900/20 active:scale-95 transition-transform"
            >
              PROCESS & PRINT
            </button>
          </div>
        </div>
      </aside>

      {/* New Customer Modal */}
      {isNewCustomerModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md shadow-2xl">
            <CardHeader className="flex flex-row justify-between items-center border-b pb-4">
              <CardTitle>New Customer</CardTitle>
              <button onClick={() => setIsNewCustomerModal(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleCreateCustomer} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number *</label>
                  <Input required value={newCustomer.phone} onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
                  <Input required value={newCustomer.name} onChange={e => setNewCustomer({...newCustomer, name: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Vehicle Make & Model</label>
                  <Input value={newCustomer.vehicleMakeModel} onChange={e => setNewCustomer({...newCustomer, vehicleMakeModel: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Referred By (Code)</label>
                  <Input placeholder="e.g. MALI-X4F2" value={newCustomer.referredByCode} onChange={e => setNewCustomer({...newCustomer, referredByCode: e.target.value})} />
                </div>
                <div className="pt-4 flex gap-3">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setIsNewCustomerModal(false)}>Cancel</Button>
                  <Button type="submit" className="flex-1">Save Customer</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
