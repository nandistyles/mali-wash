import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Trash2, Plus } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export default function Settings() {
  const settings = useLiveQuery(() => db.settings.get('global'));
  
  const [pointsPerWash, setPointsPerWash] = useState('5');
  const [referralPoints, setReferralPoints] = useState('50');
  
  const [services, setServices] = useState<{id: string, name: string, price: number, type: "wash" | "membership" | "fleet"}[]>([]);

  useEffect(() => {
    if (settings) {
      setPointsPerWash(settings.pointsPerWash.toString());
      setReferralPoints(settings.referralRewardPoints.toString());
      setServices(settings.services || []);
    }
  }, [settings]);

  const handleSavePoints = async () => {
    await db.settings.update('global', {
      pointsPerWash: parseInt(pointsPerWash, 10),
      referralRewardPoints: parseInt(referralPoints, 10),
      syncStatus: 'pending_sync'
    });
    alert('Loyalty Rules saved!');
  };

  const handleSaveServices = async () => {
    await db.settings.update('global', {
      services,
      syncStatus: 'pending_sync'
    });
    alert('Services saved!');
  };

  const updateService = (index: number, field: string, value: any) => {
    const updated = [...services];
    updated[index] = { ...updated[index], [field]: value };
    setServices(updated);
  };

  const addService = () => {
    setServices([...services, { id: uuidv4(), name: 'New Service', price: 0, type: 'wash' }]);
  };

  const removeService = (index: number) => {
    setServices(services.filter((_, i) => i !== index));
  };

  return (
    <div className="h-full w-full p-6 overflow-auto bg-ink-50 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Admin Settings</h1>
        <p className="text-ink-500">Configure app rules and pricing</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 items-start">
        <Card>
          <CardHeader>
            <CardTitle>Loyalty Rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Points Earned per Wash</label>
              <Input 
                type="number" 
                value={pointsPerWash}
                onChange={e => setPointsPerWash(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Referral Reward Points</label>
              <Input 
                type="number" 
                value={referralPoints}
                onChange={e => setReferralPoints(e.target.value)}
              />
            </div>
            <Button onClick={handleSavePoints} className="w-full bg-brand-900 hover:bg-brand-900">Save Rules</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Services & Pricing</CardTitle>
            <Button size="sm" variant="outline" onClick={addService} className="flex gap-1 items-center">
              <Plus className="w-4 h-4" /> Add Service
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {services.map((s, idx) => (
                <div key={s.id} className="flex flex-col gap-2 p-3 border border-ink-200 rounded-lg bg-white relative">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-xs text-ink-500 font-medium">Service Name</label>
                      <Input 
                        value={s.name} 
                        onChange={(e) => updateService(idx, 'name', e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="w-24">
                      <label className="text-xs text-ink-500 font-medium">Price (USD)</label>
                      <Input 
                        type="number" 
                        step="0.01"
                        value={s.price} 
                        onChange={(e) => updateService(idx, 'price', parseFloat(e.target.value) || 0)}
                        className="h-8 text-sm font-bold text-brand-700"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-between items-center">
                    <div>
                      <select 
                        value={s.type}
                        onChange={(e) => updateService(idx, 'type', e.target.value)}
                        className="h-8 text-xs bg-ink-50 border border-ink-200 rounded-md px-2"
                      >
                        <option value="wash">Wash</option>
                        <option value="membership">Membership</option>
                        <option value="fleet">Fleet</option>
                      </select>
                    </div>
                    <button 
                      onClick={() => removeService(idx)}
                      className="text-red-500 hover:text-red-700 p-1 rounded-md hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            <Button onClick={handleSaveServices} className="w-full bg-brand-900 hover:bg-brand-900 mt-4">Save Services</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
