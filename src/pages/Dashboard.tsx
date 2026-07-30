import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { formatCurrency } from '../lib/utils';
import { TrendingUp, Users, DollarSign, Activity, CreditCard, Banknote, Smartphone } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function Dashboard() {
  const transactions = useLiveQuery(() => db.transactions.toArray());
  const customers = useLiveQuery(() => db.customers.toArray());

  // Aggregate stats
  const totalRevenue = transactions?.reduce((sum, t) => sum + (t.status === 'completed' ? t.amount : 0), 0) || 0;
  const washCount = transactions?.filter(t => t.status === 'completed' && t.amount > 0).length || 0;
  
  const byPayment = {
    cash_usd: transactions?.reduce((sum, t) => sum + (t.status === 'completed' && t.paymentMethod === 'cash_usd' ? t.amount : 0), 0) || 0,
    ecocash: transactions?.reduce((sum, t) => sum + (t.status === 'completed' && t.paymentMethod === 'ecocash' ? t.amount : 0), 0) || 0,
    card: transactions?.reduce((sum, t) => sum + (t.status === 'completed' && t.paymentMethod === 'card' ? t.amount : 0), 0) || 0,
  };

  const totalCustomers = customers?.length || 0;
  const members = customers?.filter(c => c.tags?.includes('wash_member')).length || 0;

  // Chart data: Group revenue by payment method for simple visualization
  const chartData = [
    { name: 'Cash', amount: byPayment.cash_usd, fill: '#10b981' },
    { name: 'EcoCash', amount: byPayment.ecocash, fill: '#3b82f6' },
    { name: 'Card', amount: byPayment.card, fill: '#a855f7' }
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto h-full w-full p-6 overflow-auto bg-slate-50">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500">Overview of wash operations</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-6 flex items-center space-x-4">
            <div className="p-3 bg-teal-100 text-teal-700 rounded-xl">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Total Revenue</p>
              <h3 className="text-2xl font-black text-slate-900">{formatCurrency(totalRevenue)}</h3>
            </div>
          </CardContent>
        </Card>
        
        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-6 flex items-center space-x-4">
            <div className="p-3 bg-blue-100 text-blue-700 rounded-xl">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Sales Volume</p>
              <h3 className="text-2xl font-black text-slate-900">{washCount}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-6 flex items-center space-x-4">
            <div className="p-3 bg-purple-100 text-purple-700 rounded-xl">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Total Customers</p>
              <h3 className="text-2xl font-black text-slate-900">{totalCustomers}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-6 flex items-center space-x-4">
            <div className="p-3 bg-amber-100 text-amber-700 rounded-xl">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Active Members</p>
              <h3 className="text-2xl font-black text-slate-900">{members}</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-sm border-slate-200 flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg">Revenue by Payment Method</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col">
            <div className="grid grid-cols-3 gap-2 mb-6">
              <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100 text-center">
                <Banknote className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
                <div className="text-xs text-emerald-800 font-semibold uppercase">Cash</div>
                <div className="font-black text-emerald-900">{formatCurrency(byPayment.cash_usd)}</div>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-center">
                <Smartphone className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                <div className="text-xs text-blue-800 font-semibold uppercase">EcoCash</div>
                <div className="font-black text-blue-900">{formatCurrency(byPayment.ecocash)}</div>
              </div>
              <div className="bg-purple-50 p-3 rounded-lg border border-purple-100 text-center">
                <CreditCard className="w-5 h-5 text-purple-600 mx-auto mb-1" />
                <div className="text-xs text-purple-800 font-semibold uppercase">Card</div>
                <div className="font-black text-purple-900">{formatCurrency(byPayment.card)}</div>
              </div>
            </div>
            
            <div className="flex-1 min-h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} tickFormatter={(val) => `$${val}`} />
                  <Tooltip 
                    cursor={{fill: '#f1f5f9'}}
                    contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                    formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                  />
                  <Bar dataKey="amount" radius={[4, 4, 0, 0]} fill="#0f766e" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg">Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-slate-100">
              {transactions?.slice(-7).reverse().map(t => (
                <div key={t.id} className="py-3 flex justify-between items-center">
                  <div>
                    <div className="font-semibold text-slate-900">
                      {t.lineItems.length > 1 ? `${t.lineItems.length} items` : t.lineItems[0]?.description || 'Sale'}
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                      <span>{new Date(t.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                      <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                      <span className="uppercase font-medium">{t.paymentMethod.replace('_', ' ')}</span>
                      {t.pointsEarned > 0 && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                          <span className="text-teal-600 font-medium">+{t.pointsEarned} pts</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="font-black text-slate-900">{formatCurrency(t.amount)}</div>
                </div>
              ))}
              {(!transactions || transactions.length === 0) && (
                <div className="py-8 text-center text-slate-400 text-sm italic">
                  No transactions yet.<br/>Head to the POS to make a sale.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
