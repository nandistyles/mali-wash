import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { v4 as uuidv4 } from 'uuid';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { formatCurrency } from '../lib/utils';
import type { Shift, Transaction } from '../types';

export default function Shifts() {
  const [openingFloat, setOpeningFloat] = useState('');
  const [countedCash, setCountedCash] = useState('');

  const shifts = useLiveQuery(() => db.shifts.reverse().toArray());
  const activeShift = shifts?.find(s => s.status === 'open');
  
  // Get transactions for active shift
  const shiftTransactions = useLiveQuery(
    () => activeShift ? db.transactions.where('shiftId').equals(activeShift.id).toArray() : [],
    [activeShift]
  );

  const handleOpenShift = async (e: import("react").FormEvent) => {
    e.preventDefault();
    const id = uuidv4();
    await db.shifts.add({
      id,
      staffId: 'staff-1', // stub
      openedAt: Date.now(),
      openingFloat: parseFloat(openingFloat) || 0,
      expectedCash: parseFloat(openingFloat) || 0, // Starts with float
      expectedEcocash: 0,
      expectedCard: 0,
      status: 'open',
      syncStatus: 'pending_sync'
    });
    setOpeningFloat('');
  };

  const handleCloseShift = async (e: import("react").FormEvent) => {
    e.preventDefault();
    if (!activeShift) return;

    // Calculate expectations
    let cash = activeShift.openingFloat;
    let ecocash = 0;
    let card = 0;

    shiftTransactions?.forEach(t => {
      if (t.status === 'completed') {
        if (t.paymentMethod === 'cash_usd') cash += t.amount;
        if (t.paymentMethod === 'ecocash') ecocash += t.amount;
        if (t.paymentMethod === 'card') card += t.amount;
      }
    });

    const counted = parseFloat(countedCash) || 0;
    const variance = counted - cash;

    await db.shifts.update(activeShift.id, {
      closedAt: Date.now(),
      expectedCash: cash,
      expectedEcocash: ecocash,
      expectedCard: card,
      countedCash: counted,
      variance: variance,
      status: 'closed',
      syncStatus: 'pending_sync'
    });

    setCountedCash('');
  };

  return (
    <div className="h-full w-full p-6 overflow-auto bg-slate-50 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Till & Shift Management</h1>
        <p className="text-slate-500">Open and close the daily till</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Active Shift Card */}
        <Card className={`border-2 ${activeShift ? 'border-teal-500' : 'border-slate-200'}`}>
          <CardHeader className={activeShift ? 'bg-teal-50' : ''}>
            <CardTitle>{activeShift ? 'Active Shift' : 'No Active Shift'}</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {!activeShift ? (
              <form onSubmit={handleOpenShift} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Opening Cash Float (USD)</label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    required 
                    value={openingFloat}
                    onChange={e => setOpeningFloat(e.target.value)}
                    placeholder="50.00" 
                  />
                </div>
                <Button type="submit" className="w-full">Open Shift</Button>
              </form>
            ) : (
              <form onSubmit={handleCloseShift} className="space-y-6">
                <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 p-4 rounded-lg">
                  <div>
                    <span className="text-slate-500 block">Opened At</span>
                    <span className="font-semibold">{new Date(activeShift.openedAt).toLocaleTimeString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Opening Float</span>
                    <span className="font-semibold">{formatCurrency(activeShift.openingFloat)}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="font-medium text-slate-700">Expected Totals</h3>
                  {/* Dynamic calculation for UI */}
                  {(() => {
                    let c = activeShift.openingFloat;
                    let e = 0;
                    let ca = 0;
                    shiftTransactions?.forEach(t => {
                      if (t.status === 'completed') {
                        if (t.paymentMethod === 'cash_usd') c += t.amount;
                        if (t.paymentMethod === 'ecocash') e += t.amount;
                        if (t.paymentMethod === 'card') ca += t.amount;
                      }
                    });
                    return (
                      <div className="space-y-2">
                        <div className="flex justify-between p-2 bg-emerald-50 rounded">
                          <span className="text-emerald-800">Cash in Till:</span>
                          <span className="font-bold text-emerald-900">{formatCurrency(c)}</span>
                        </div>
                        <div className="flex justify-between p-2 bg-blue-50 rounded">
                          <span className="text-blue-800">EcoCash:</span>
                          <span className="font-bold text-blue-900">{formatCurrency(e)}</span>
                        </div>
                        <div className="flex justify-between p-2 bg-purple-50 rounded">
                          <span className="text-purple-800">Card/Swipe:</span>
                          <span className="font-bold text-purple-900">{formatCurrency(ca)}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="pt-4 border-t border-slate-200">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Enter Counted Cash (USD)</label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    required 
                    value={countedCash}
                    onChange={e => setCountedCash(e.target.value)}
                    placeholder="Enter actual physical cash" 
                    className="text-lg font-semibold"
                  />
                </div>
                
                <Button type="submit" variant="destructive" className="w-full">
                  Close Shift (Z-Report)
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Shift History */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Shifts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {shifts?.filter(s => s.status === 'closed').slice(0, 5).map(shift => (
                <div key={shift.id} className="p-4 border rounded-lg bg-white shadow-sm">
                  <div className="flex justify-between items-center mb-2 text-sm text-slate-500">
                    <span>{new Date(shift.openedAt).toLocaleDateString()}</span>
                    <span>{shift.variance === 0 ? '✅ Balanced' : shift.variance! > 0 ? '⬆️ Over' : '⬇️ Short'}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-slate-400 text-xs uppercase block">Expected Cash</span>
                      <span className="font-semibold text-slate-900">{formatCurrency(shift.expectedCash)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-xs uppercase block">Counted Cash</span>
                      <span className="font-semibold text-slate-900">{formatCurrency(shift.countedCash || 0)}</span>
                    </div>
                    <div className="col-span-2 mt-1">
                      <span className="text-slate-400 text-xs uppercase block">Variance</span>
                      <span className={`font-bold ${
                        (shift.variance || 0) === 0 ? 'text-teal-600' : 'text-red-500'
                      }`}>
                        {formatCurrency(shift.variance || 0)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {(!shifts || shifts.filter(s => s.status === 'closed').length === 0) && (
                <div className="text-center text-slate-500 py-4">No closed shifts yet.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
