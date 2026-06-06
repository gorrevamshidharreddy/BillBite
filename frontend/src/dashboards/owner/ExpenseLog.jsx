import { useState, useEffect } from 'react';
import api from '../../services/api';

export default function ExpenseLog() {
  const [activeTab, setActiveTab] = useState('raw');
  const [rawExpenses, setRawExpenses] = useState([]);
  const [otherExpenses, setOtherExpenses] = useState([]);
  const [rawForm, setRawForm] = useState({ item_name: '', quantity: '', unit: '', amount: '', vendor: '', date: '' });
  const [otherForm, setOtherForm] = useState({ category: '', amount: '', description: '', date: '' });

  const fetchRawExpenses = async () => {
    const res = await api.get('/owner/expenses/raw');
    setRawExpenses(res.data);
  };

  const fetchOtherExpenses = async () => {
    const res = await api.get('/owner/expenses/other');
    setOtherExpenses(res.data);
  };

  useEffect(() => {
    fetchRawExpenses();
    fetchOtherExpenses();
  }, []);

  const submitRawExpense = async (e) => {
    e.preventDefault();
    await api.post('/owner/expenses/raw', {
      item_name: rawForm.item_name,
      quantity: rawForm.quantity ? parseFloat(rawForm.quantity) : null,
      unit: rawForm.unit || null,
      amount: parseFloat(rawForm.amount),
      vendor: rawForm.vendor || null,
      date: rawForm.date || null,
    });
    setRawForm({ item_name: '', quantity: '', unit: '', amount: '', vendor: '', date: '' });
    fetchRawExpenses();
  };

  const submitOtherExpense = async (e) => {
    e.preventDefault();
    await api.post('/owner/expenses/other', {
      category: otherForm.category,
      amount: parseFloat(otherForm.amount),
      description: otherForm.description || null,
      date: otherForm.date || null,
    });
    setOtherForm({ category: '', amount: '', description: '', date: '' });
    fetchOtherExpenses();
  };

  return (
    <div>
      <h2>Expense Log</h2>
      <div>
        <button onClick={() => setActiveTab('raw')} style={{ fontWeight: activeTab === 'raw' ? 'bold' : '' }}>Raw Materials</button>
        <button onClick={() => setActiveTab('other')} style={{ fontWeight: activeTab === 'other' ? 'bold' : '' }}>Other Expenses</button>
      </div>

      {activeTab === 'raw' ? (
        <div>
          <h3>Add Raw Material Purchase</h3>
          <form onSubmit={submitRawExpense}>
            <input placeholder="Item name *" value={rawForm.item_name} onChange={e => setRawForm({...rawForm, item_name: e.target.value})} required />
            <input type="number" step="any" placeholder="Quantity" value={rawForm.quantity} onChange={e => setRawForm({...rawForm, quantity: e.target.value})} />
            <input placeholder="Unit (kg, l)" value={rawForm.unit} onChange={e => setRawForm({...rawForm, unit: e.target.value})} />
            <input type="number" step="0.01" placeholder="Amount *" value={rawForm.amount} onChange={e => setRawForm({...rawForm, amount: e.target.value})} required />
            <input placeholder="Vendor" value={rawForm.vendor} onChange={e => setRawForm({...rawForm, vendor: e.target.value})} />
            <input type="date" value={rawForm.date} onChange={e => setRawForm({...rawForm, date: e.target.value})} />
            <button type="submit">Add</button>
          </form>

          <h3>Raw Material Expenses</h3>
          <table border="1" cellPadding="5">
            <thead><tr><th>Date</th><th>Item</th><th>Quantity</th><th>Amount</th><th>Vendor</th></tr></thead>
            <tbody>
              {rawExpenses.map(e => (
                <tr key={e.id}>
                  <td>{e.date?.split('T')[0]}</td>
                  <td>{e.item_name}</td>
                  <td>{e.quantity} {e.unit}</td>
                  <td>₹{e.amount}</td>
                  <td>{e.vendor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div>
          <h3>Add Other Expense</h3>
          <form onSubmit={submitOtherExpense}>
            <input placeholder="Category (rent, salary, etc.) *" value={otherForm.category} onChange={e => setOtherForm({...otherForm, category: e.target.value})} required />
            <input type="number" step="0.01" placeholder="Amount *" value={otherForm.amount} onChange={e => setOtherForm({...otherForm, amount: e.target.value})} required />
            <input placeholder="Description" value={otherForm.description} onChange={e => setOtherForm({...otherForm, description: e.target.value})} />
            <input type="date" value={otherForm.date} onChange={e => setOtherForm({...otherForm, date: e.target.value})} />
            <button type="submit">Add</button>
          </form>

          <h3>Other Expenses</h3>
          <table border="1" cellPadding="5">
            <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th></tr></thead>
            <tbody>
              {otherExpenses.map(e => (
                <tr key={e.id}>
                  <td>{e.date?.split('T')[0]}</td>
                  <td>{e.category}</td>
                  <td>{e.description}</td>
                  <td>₹{e.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}