import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Search, Share2, Award, History } from 'lucide-react';
import { sendReferralCode } from '../lib/whatsapp';
import type { Customer } from '../types';

export default function Customers() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const customers = useLiveQuery(
    () => {
      if (searchTerm.length > 2) {
        return db.customers
          .where('phone').startsWithIgnoreCase(searchTerm)
          .or('name').startsWithIgnoreCase(searchTerm)
          .toArray();
      }
      return db.customers.limit(50).toArray();
    },
    [searchTerm]
  );

  const transactions = useLiveQuery(
    () => selectedCustomer ? db.transactions.where('customerId').equals(selectedCustomer.id).reverse().sortBy('createdAt') : [],
    [selectedCustomer]
  );

  const handleShareReferral = async (customer: Customer) => {
    await sendReferralCode(customer.phone, customer.name, customer.referralCode);
    alert('Referral code sent via WhatsApp (simulated)');
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full w-full p-6 bg-slate-50 overflow-hidden">
      {/* Left List */}
      <Card className="flex-1 flex flex-col h-full shrink-0 min-w-0">
        <div className="p-4 border-b border-slate-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <Input 
              placeholder="Search by name or phone..." 
              className="pl-10"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {customers?.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No customers found.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {customers?.map(customer => (
                <button
                  key={customer.id}
                  onClick={() => setSelectedCustomer(customer)}
                  className={`w-full text-left p-4 hover:bg-slate-50 transition-colors flex justify-between items-center ${
                    selectedCustomer?.id === customer.id ? 'bg-teal-50 border-l-4 border-teal-600' : 'border-l-4 border-transparent'
                  }`}
                >
                  <div>
                    <div className="font-semibold text-slate-900">{customer.name}</div>
                    <div className="text-sm text-slate-500">{customer.phone}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-teal-700 font-bold">{customer.pointsBalance} pts</div>
                    {customer.tags?.includes('wash_member') && (
                      <div className="text-xs bg-teal-100 text-teal-800 px-2 py-0.5 rounded mt-1">
                        Member
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Right Details Profile */}
      {selectedCustomer ? (
        <div className="flex-1 flex flex-col gap-6 w-full lg:w-[500px] shrink-0">
          <Card>
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">{selectedCustomer.name}</h2>
                  <p className="text-lg text-slate-600">{selectedCustomer.phone}</p>
                  {selectedCustomer.vehicles?.[0]?.makeModel && (
                    <p className="text-slate-500 text-sm mt-1">Vehicle: {selectedCustomer.vehicles?.[0]?.makeModel}</p>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-3xl font-black text-teal-700">{selectedCustomer.pointsBalance}</div>
                  <div className="text-sm text-teal-900 uppercase font-bold tracking-wider">Points</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <div className="text-sm text-slate-500 font-medium mb-1 flex items-center">
                    <Award className="w-4 h-4 mr-1" /> Tier
                  </div>
                  <div className="font-semibold text-slate-900 capitalize">
                    {selectedCustomer.tags?.includes('wash_member') ? 'Wash Member' : 'None'}
                  </div>
                </div>
                <div className="bg-teal-50 p-4 rounded-lg border border-teal-100 text-teal-900 flex flex-col items-center justify-center">
                  <div className="text-xs font-semibold uppercase tracking-wider mb-1">Referral Code</div>
                  <div className="text-xl font-mono font-bold">{selectedCustomer.referralCode}</div>
                  <Button variant="outline" size="sm" className="mt-2 w-full text-xs h-8" onClick={() => handleShareReferral(selectedCustomer)}>
                    <Share2 className="w-3 h-3 mr-1" /> Share
                  </Button>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 flex items-center mb-4">
                  <History className="w-4 h-4 mr-2" /> Recent Visits
                </h3>
                <div className="space-y-3">
                  {transactions?.length === 0 ? (
                    <p className="text-sm text-slate-500">No visits recorded.</p>
                  ) : (
                    transactions?.slice(0, 5).map(t => (
                      <div key={t.id} className="flex justify-between items-center p-3 rounded-md border border-slate-100 bg-slate-50 text-sm">
                        <div>
                          <div className="font-medium text-slate-900 capitalize">{t.businessMeta?.serviceType?.replace('_', ' ')}</div>
                          <div className="text-slate-500">{new Date(t.createdAt).toLocaleDateString()}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-slate-900">${t.amount.toFixed(2)}</div>
                          <div className="text-teal-600 text-xs">+{t.pointsEarned} pts</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="flex-1 hidden lg:flex items-center justify-center border-2 border-dashed border-slate-200 rounded-lg bg-slate-50">
          <div className="text-center text-slate-400">
            <Search className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="font-medium text-lg">Select a customer</p>
            <p className="text-sm">View details, points, and history</p>
          </div>
        </div>
      )}
    </div>
  );
}
