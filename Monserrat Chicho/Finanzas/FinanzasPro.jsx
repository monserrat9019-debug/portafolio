import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, collection, query, where, orderBy, onSnapshot, addDoc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { Home, BarChart3, TrendingUp, HandCoins, PiggyBank, Scale, Wallet, PlusCircle, Trash2, LogOut, Loader2, DollarSign, Calendar } from 'lucide-react';

// --- CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'finanzas-pro-default';

// Inicialización de Firebase
let app, db, auth;
try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
} catch (error) {
    console.error("Error al inicializar Firebase:", error);
}

// Constantes y Datos Mock
const CATEGORIES = {
    Egreso: [
        'Vivienda', 'Transporte', 'Alimentos', 'Entretenimiento', 'Deudas',
        'Educación', 'Salud', 'Ahorro', 'Inversión', 'Otros'
    ],
    Ingreso: [
        'Salario', 'Freelance', 'Inversiones', 'Regalo', 'Otros Ingresos'
    ]
};

const RISK_PROFILES = {
    Conservador: {
        descripcion: 'Prioriza la preservación del capital con bajo riesgo.',
        allocation: [
            { name: 'Renta Fija (RF)', value: 70, color: '#4c51bf' },
            { name: 'Renta Variable (RV)', value: 30, color: '#48bb78' },
        ],
        rendimiento_esperado: '5% - 8%',
    },
    Moderado: {
        descripcion: 'Busca un equilibrio entre crecimiento y riesgo.',
        allocation: [
            { name: 'Renta Fija (RF)', value: 50, color: '#4c51bf' },
            { name: 'Renta Variable (RV)', value: 50, color: '#48bb78' },
        ],
        rendimiento_esperado: '8% - 12%',
    },
    Agresivo: {
        descripcion: 'Busca alto crecimiento aceptando mayor volatilidad.',
        allocation: [
            { name: 'Renta Fija (RF)', value: 30, color: '#4c51bf' },
            { name: 'Renta Variable (RV)', value: 70, color: '#48bb78' },
        ],
        rendimiento_esperado: '12% - 18%',
    },
};

// --- FUNCIONES DE BASE DE DATOS Y UTILIDADES ---

/**
 * Obtiene la referencia a una colección específica del usuario.
 * @param {string} userId - El ID del usuario actual.
 * @param {string} collectionName - Nombre de la colección (e.g., 'transactions').
 * @returns {import('firebase/firestore').CollectionReference}
 */
const getUserCollectionRef = (userId, collectionName) => {
    return collection(db, 'artifacts', appId, 'users', userId, collectionName);
};

/**
 * Formatea un número a moneda (USD).
 * @param {number} amount
 * @returns {string}
 */
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0
    }).format(amount);
};

// --- CÁLCULO DE MÉTRICAS FINANCIERAS ---

const calculateMetrics = (transactions, healthData, portfolioData) => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const currentMonthData = transactions.filter(t => {
        const date = new Date(t.date);
        return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    });

    const totalIncome = currentMonthData
        .filter(t => t.type === 'Ingreso')
        .reduce((sum, t) => sum + t.amount, 0);

    const totalExpense = currentMonthData
        .filter(t => t.type === 'Egreso')
        .reduce((sum, t) => sum + t.amount, 0);

    const netMonthlyFlow = totalIncome - totalExpense;
    const savingsRatio = totalIncome > 0 ? (netMonthlyFlow / totalIncome) * 100 : 0;
    const debtToIncomeRatio = healthData?.totalDebt && totalIncome > 0 ? (healthData.totalDebt / (totalIncome * 12)) * 100 : 0; // Usando ingreso mensual * 12 como proxy anual

    // Cálculo de Fondo de Emergencia
    const averageMonthlyExpense = transactions.length > 0
        ? transactions.filter(t => t.type === 'Egreso').reduce((sum, t) => sum + t.amount, 0) / (new Set(transactions.map(t => `${new Date(t.date).getFullYear()}-${new Date(t.date).getMonth()}`)).size || 1)
        : 0;

    const emergencyFundMonths = averageMonthlyExpense > 0
        ? (healthData?.emergencyFund || 0) / averageMonthlyExpense
        : 0;

    // Proyección simple de Portafolio (ejemplo, asumiendo 10 años y capital actual)
    const portfolioReturn = portfolioData?.riskProfile ? parseFloat(RISK_PROFILES[portfolioData.riskProfile].rendimiento_esperado.split('-')[0].replace('%', '')) / 100 : 0.05;
    const futureValue = (healthData?.investmentCapital || 0) * Math.pow(1 + portfolioReturn, 10);

    return {
        totalIncome,
        totalExpense,
        netMonthlyFlow,
        savingsRatio: Math.max(0, savingsRatio).toFixed(1), // Asegura que no sea negativo
        debtToIncomeRatio: debtToIncomeRatio.toFixed(1),
        emergencyFundMonths: emergencyFundMonths.toFixed(1),
        futureValue: futureValue,
        averageMonthlyExpense,
    };
};

// --- COMPONENTES RECHARTS ---

const COLORS = ['#4c51bf', '#48bb78', '#f6ad55', '#e53e3e', '#38b2ac', '#d53f8c', '#4299e1'];

const TransactionPieChart = ({ transactions }) => {
    const expenseData = transactions.filter(t => t.type === 'Egreso');

    const groupedData = expenseData.reduce((acc, item) => {
        acc[item.category] = (acc[item.category] || 0) + item.amount;
        return acc;
    }, {});

    const pieData = Object.keys(groupedData).map(key => ({
        name: key,
        value: groupedData[key],
    })).sort((a, b) => b.value - a.value); // Ordenar por valor

    return (
        <ResponsiveContainer width="100%" height={300}>
            <PieChart>
                <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    fill="#8884d8"
                    labelLine={false}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                >
                    {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend layout="horizontal" align="center" verticalAlign="bottom" />
            </PieChart>
        </ResponsiveContainer>
    );
};

const IncomeExpenseBarChart = ({ transactions }) => {
    const monthlyData = transactions.reduce((acc, t) => {
        const date = new Date(t.date);
        const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
        if (!acc[monthKey]) {
            acc[monthKey] = { name: `${date.toLocaleString('es-US', { month: 'short' })} ${date.getFullYear()}`, Ingreso: 0, Egreso: 0 };
        }
        acc[monthKey][t.type] += t.amount;
        return acc;
    }, {});

    const data = Object.values(monthlyData).sort((a, b) => {
        // Ordenar por año y mes
        const [aYear, aMonth] = a.name.split(' ').map(s => parseInt(s.replace(/[^0-9]/g, '')) || 0);
        const [bYear, bMonth] = b.name.split(' ').map(s => parseInt(s.replace(/[^0-9]/g, '')) || 0);
        if (aYear !== bYear) return aYear - bYear;
        return aMonth - bMonth;
    }).slice(-6); // Mostrar últimos 6 meses

    return (
        <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" stroke="#4a5568" />
                <YAxis tickFormatter={formatCurrency} stroke="#4a5568" />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Bar dataKey="Ingreso" fill="#48bb78" />
                <Bar dataKey="Egreso" fill="#e53e3e" />
            </BarChart>
        </ResponsiveContainer>
    );
};

const ProjectionLineChart = ({ capital, annualReturn }) => {
    const years = 10;
    const data = [];
    let currentCapital = capital;
    const rate = annualReturn / 100;

    for (let i = 0; i <= years; i++) {
        data.push({
            year: `Año ${i}`,
            value: Math.round(currentCapital),
        });
        currentCapital *= (1 + rate);
    }

    return (
        <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="year" stroke="#4a5568" />
                <YAxis tickFormatter={formatCurrency} stroke="#4a5568" />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Line type="monotone" dataKey="value" stroke="#4c51bf" activeDot={{ r: 8 }} name="Valor Proyectado" />
            </LineChart>
        </ResponsiveContainer>
    );
};

// --- COMPONENTE DE PESTAÑAS ---

const NavItem = ({ title, icon: Icon, current, onClick }) => (
    <button
        onClick={onClick}
        className={`flex items-center space-x-2 px-4 py-3 rounded-xl transition-all duration-200 ${current
            ? 'bg-indigo-600 text-white shadow-lg'
            : 'text-gray-600 hover:bg-indigo-50 hover:text-indigo-600'
            }`}
    >
        <Icon className="w-5 h-5" />
        <span className="font-semibold">{title}</span>
    </button>
);

// --- MODAL DE AGREGAR TRANSACCIÓN ---

const AddTransactionModal = ({ userId, onClose }) => {
    const [type, setType] = useState('Egreso');
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState(CATEGORIES.Egreso[0]);
    const [description, setDescription] = useState('');
    const [date, setDate] = useState(new Date().toISOString().substring(0, 10));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!userId || !amount || !category || !date) return;

        const transactionData = {
            type,
            amount: parseFloat(amount),
            category,
            description,
            date,
            createdAt: new Date().toISOString(),
        };

        try {
            await addDoc(getUserCollectionRef(userId, 'transactions'), transactionData);
            onClose();
        } catch (error) {
            console.error("Error al añadir transacción:", error);
        }
    };

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
                <h3 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-2">Añadir Transacción</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="flex space-x-4">
                        <div className="w-1/2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                            <select
                                value={type}
                                onChange={(e) => {
                                    setType(e.target.value);
                                    // Reset category when type changes
                                    setCategory(CATEGORIES[e.target.value][0]);
                                }}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition duration-150"
                                required
                            >
                                <option value="Egreso">Egreso</option>
                                <option value="Ingreso">Ingreso</option>
                            </select>
                        </div>
                        <div className="w-1/2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Monto ($)</label>
                            <input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition duration-150"
                                placeholder="100.00"
                                step="0.01"
                                min="0.01"
                                required
                            />
                        </div>
                    </div>

                    <div className="flex space-x-4">
                        <div className="w-1/2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition duration-150"
                                required
                            >
                                {CATEGORIES[type].map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>
                        <div className="w-1/2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition duration-150"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Descripción (Opcional)</label>
                        <input
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition duration-150"
                            placeholder="Cena con amigos, Renta mensual, etc."
                        />
                    </div>

                    <div className="flex justify-end space-x-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 transition duration-150"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition duration-150 shadow-md"
                        >
                            Guardar Transacción
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- PANELES INDIVIDUALES ---

const MetricCard = ({ title, value, icon: Icon, colorClass, currency = true }) => (
    <div className={`bg-white p-6 rounded-xl shadow-lg border-l-4 ${colorClass} transition duration-300 hover:shadow-xl`}>
        <div className="flex items-center justify-between">
            <p className="text-lg font-semibold text-gray-600">{title}</p>
            <Icon className="w-8 h-8 text-gray-400" />
        </div>
        <p className="text-3xl font-bold text-gray-900 mt-2">
            {currency ? formatCurrency(value) : value}
        </p>
    </div>
);

const HealthCard = ({ title, value, unit, icon: Icon, color }) => (
    <div className="bg-white p-6 rounded-xl shadow-lg transition duration-300 hover:shadow-xl flex items-center justify-between">
        <div className="flex items-center space-x-4">
            <div className={`p-3 rounded-full ${color.bg} ${color.text}`}>
                <Icon className="w-6 h-6" />
            </div>
            <div>
                <p className="text-sm font-medium text-gray-500">{title}</p>
                <p className="text-xl font-bold text-gray-800">{value} {unit}</p>
            </div>
        </div>
    </div>
);

const HealthPanel = ({ userId, healthData, metrics }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [localHealthData, setLocalHealthData] = useState(healthData || { investmentCapital: 0, totalDebt: 0, emergencyFund: 0 });

    useEffect(() => {
        setLocalHealthData(healthData || { investmentCapital: 0, totalDebt: 0, emergencyFund: 0 });
    }, [healthData]);

    const handleSave = async () => {
        try {
            const healthDocRef = doc(getUserCollectionRef(userId, 'profile'), 'healthMetrics');
            await setDoc(healthDocRef, localHealthData, { merge: true });
            setIsEditing(false);
        } catch (error) {
            console.error("Error al guardar métricas de salud:", error);
        }
    };

    const debtColor = metrics.debtToIncomeRatio < 36 ? { bg: 'bg-green-100', text: 'text-green-600' } : { bg: 'bg-red-100', text: 'text-red-600' };
    const savingsColor = metrics.savingsRatio > 10 ? { bg: 'bg-green-100', text: 'text-green-600' } : { bg: 'bg-yellow-100', text: 'text-yellow-600' };
    const fundColor = metrics.emergencyFundMonths >= 3 ? { bg: 'bg-green-100', text: 'text-green-600' } : { bg: 'bg-red-100', text: 'text-red-600' };

    return (
        <div className="bg-gray-50 p-6 rounded-xl shadow-lg space-y-6">
            <h2 className="text-3xl font-extrabold text-gray-800 flex items-center space-x-2">
                <Scale className="w-7 h-7 text-indigo-600" />
                <span>Panel de Salud Financiera</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <HealthCard
                    title="Ratio Ahorro Mensual"
                    value={metrics.savingsRatio}
                    unit="%"
                    icon={PiggyBank}
                    color={savingsColor}
                />
                <HealthCard
                    title="Ratio Deuda/Ingreso"
                    value={metrics.debtToIncomeRatio}
                    unit="%"
                    icon={HandCoins}
                    color={debtColor}
                />
                <HealthCard
                    title="Fondo Emergencia"
                    value={metrics.emergencyFundMonths}
                    unit="meses"
                    icon={Wallet}
                    color={fundColor}
                />
            </div>

            <div className="bg-white p-5 rounded-lg shadow-inner">
                <h3 className="text-xl font-bold text-gray-800 mb-4">Métricas de Base</h3>
                {!isEditing ? (
                    <div className="space-y-3">
                        <p><span className="font-semibold text-gray-600">Capital de Inversión:</span> {formatCurrency(localHealthData.investmentCapital || 0)}</p>
                        <p><span className="font-semibold text-gray-600">Deuda Total Estimada:</span> {formatCurrency(localHealthData.totalDebt || 0)}</p>
                        <p><span className="font-semibold text-gray-600">Fondo de Emergencia Actual:</span> {formatCurrency(localHealthData.emergencyFund || 0)}</p>
                        <button
                            onClick={() => setIsEditing(true)}
                            className="mt-3 px-4 py-2 text-sm bg-indigo-100 text-indigo-600 font-semibold rounded-lg hover:bg-indigo-200 transition"
                        >
                            Editar Métricas Base
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <input
                            type="number"
                            placeholder="Capital de Inversión"
                            value={localHealthData.investmentCapital}
                            onChange={(e) => setLocalHealthData({ ...localHealthData, investmentCapital: parseFloat(e.target.value) || 0 })}
                            className="w-full p-2 border rounded-lg"
                        />
                        <input
                            type="number"
                            placeholder="Deuda Total Estimada"
                            value={localHealthData.totalDebt}
                            onChange={(e) => setLocalHealthData({ ...localHealthData, totalDebt: parseFloat(e.target.value) || 0 })}
                            className="w-full p-2 border rounded-lg"
                        />
                        <input
                            type="number"
                            placeholder="Fondo de Emergencia Actual"
                            value={localHealthData.emergencyFund}
                            onChange={(e) => setLocalHealthData({ ...localHealthData, emergencyFund: parseFloat(e.target.value) || 0 })}
                            className="w-full p-2 border rounded-lg"
                        />
                        <div className="flex space-x-2 mt-3">
                            <button
                                onClick={handleSave}
                                className="px-4 py-2 text-sm bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition"
                            >
                                Guardar
                            </button>
                            <button
                                onClick={() => setIsEditing(false)}
                                className="px-4 py-2 text-sm bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 transition"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const DashboardPanel = ({ transactions, healthData, portfolioData }) => {
    const metrics = useMemo(() => calculateMetrics(transactions, healthData, portfolioData), [transactions, healthData, portfolioData]);

    // Usar el rendimiento del perfil o un valor por defecto
    const annualReturn = portfolioData?.riskProfile ? parseFloat(RISK_PROFILES[portfolioData.riskProfile].rendimiento_esperado.split('-')[0].replace('%', '')) : 5;
    const investmentCapital = healthData?.investmentCapital || 0;

    return (
        <div className="p-6 space-y-8">
            <h1 className="text-4xl font-extrabold text-gray-900">Resumen Financiero Mensual</h1>

            {/* Métrica principales */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <MetricCard
                    title="Ingreso Total (Mes)"
                    value={metrics.totalIncome}
                    icon={DollarSign}
                    colorClass="border-green-500"
                />
                <MetricCard
                    title="Gasto Total (Mes)"
                    value={metrics.totalExpense}
                    icon={Wallet}
                    colorClass="border-red-500"
                />
                <MetricCard
                    title="Flujo Neto (Mes)"
                    value={metrics.netMonthlyFlow}
                    icon={HandCoins}
                    colorClass={metrics.netMonthlyFlow >= 0 ? "border-indigo-500" : "border-pink-500"}
                />
            </div>

            {/* Gráficos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-lg">
                    <h3 className="text-xl font-bold mb-4 text-gray-800">Distribución de Gastos (Mes)</h3>
                    <TransactionPieChart transactions={transactions} />
                </div>
                <div className="bg-white p-6 rounded-xl shadow-lg">
                    <h3 className="text-xl font-bold mb-4 text-gray-800">Ingresos vs Egresos (Últimos 6 meses)</h3>
                    <IncomeExpenseBarChart transactions={transactions} />
                </div>
            </div>

            {/* Salud Financiera y Proyección de Inversiones */}
            <HealthPanel userId={healthData.userId} healthData={healthData} metrics={metrics} />

            {investmentCapital > 0 && (
                <div className="bg-white p-6 rounded-xl shadow-lg">
                    <h3 className="text-xl font-bold mb-4 text-gray-800">Proyección de Inversión a 10 Años</h3>
                    <p className="text-sm text-gray-600 mb-4">Basado en Capital Actual ({formatCurrency(investmentCapital)}) y Rendimiento Esperado ({annualReturn.toFixed(0)}%)</p>
                    <ProjectionLineChart capital={investmentCapital} annualReturn={annualReturn} />
                </div>
            )}
        </div>
    );
};

const TransactionsPanel = ({ userId, transactions }) => {
    const [filterType, setFilterType] = useState('Todos');
    const [search, setSearch] = useState('');

    const handleDelete = async (id) => {
        // En un ambiente real, se usaría un modal de confirmación
        if (window.confirm('¿Está seguro de que desea eliminar esta transacción?')) {
            try {
                await updateDoc(doc(getUserCollectionRef(userId, 'transactions'), id), {
                    // Soft delete o simplemente deleteDoc
                    deleted: true
                });
                // Para simplificar, aquí usaremos deleteDoc para el demo
                // await deleteDoc(doc(getUserCollectionRef(userId, 'transactions'), id));
            } catch (error) {
                console.error("Error al eliminar transacción:", error);
            }
        }
    };

    const filteredTransactions = useMemo(() => {
        return transactions
            .filter(t => filterType === 'Todos' || t.type === filterType)
            .filter(t => search === '' || t.description.toLowerCase().includes(search.toLowerCase()) || t.category.toLowerCase().includes(search.toLowerCase()))
            .sort((a, b) => new Date(b.date) - new Date(a.date)); // Ordenar por fecha descendente
    }, [transactions, filterType, search]);

    return (
        <div className="p-6 space-y-6">
            <h1 className="text-4xl font-extrabold text-gray-900">Historial de Transacciones</h1>

            {/* Controles de Filtro y Búsqueda */}
            <div className="bg-white p-4 rounded-xl shadow flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4">
                <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition duration-150"
                >
                    <option value="Todos">Todos los Tipos</option>
                    <option value="Ingreso">Ingresos</option>
                    <option value="Egreso">Egresos</option>
                </select>
                <input
                    type="text"
                    placeholder="Buscar por descripción o categoría..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="flex-grow p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition duration-150"
                />
                <button
                    onClick={() => setFilterType('Todos')}
                    className="px-4 py-2 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 transition"
                >
                    Limpiar Filtros
                </button>
            </div>

            {/* Tabla de Transacciones */}
            <div className="overflow-x-auto bg-white rounded-xl shadow-lg">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categoría</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descripción</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Monto</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredTransactions.map((t) => (
                            <tr key={t.id} className="hover:bg-gray-50 transition duration-150">
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {new Date(t.date).toLocaleDateString('es-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                                </td>
                                <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${t.type === 'Ingreso' ? 'text-green-600' : 'text-red-600'}`}>
                                    {t.type}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">{t.category}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">{t.description || '-'}</td>
                                <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold text-right ${t.type === 'Ingreso' ? 'text-green-600' : 'text-red-600'}`}>
                                    {formatCurrency(t.amount)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button
                                        onClick={() => handleDelete(t.id)}
                                        className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-50 transition"
                                        title="Eliminar Transacción"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredTransactions.length === 0 && (
                    <p className="text-center py-8 text-gray-500">No hay transacciones que coincidan con los filtros.</p>
                )}
            </div>
        </div>
    );
};

const PortfolioPanel = ({ userId, portfolioData }) => {
    const [selectedRisk, setSelectedRisk] = useState(portfolioData?.riskProfile || 'Moderado');

    // Sincronizar estado local con datos de Firebase al cargar
    useEffect(() => {
        if (portfolioData?.riskProfile) {
            setSelectedRisk(portfolioData.riskProfile);
        }
    }, [portfolioData]);

    const currentProfile = RISK_PROFILES[selectedRisk];

    const handleSave = async () => {
        try {
            const portfolioDocRef = doc(getUserCollectionRef(userId, 'profile'), 'portfolio');
            await setDoc(portfolioDocRef, { riskProfile: selectedRisk, updatedAt: new Date().toISOString() }, { merge: true });
        } catch (error) {
            console.error("Error al guardar portafolio:", error);
        }
    };

    return (
        <div className="p-6 space-y-8">
            <h1 className="text-4xl font-extrabold text-gray-900">Constructor de Portafolio de Inversión</h1>

            {/* Selector de Perfil de Riesgo */}
            <div className="bg-white p-6 rounded-xl shadow-lg">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">1. Selecciona tu Perfil de Riesgo</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {Object.keys(RISK_PROFILES).map((key) => (
                        <div
                            key={key}
                            className={`p-5 border-2 rounded-xl cursor-pointer transition duration-300 ${selectedRisk === key ? 'border-indigo-600 bg-indigo-50 shadow-lg' : 'border-gray-200 hover:border-indigo-400'}`}
                            onClick={() => setSelectedRisk(key)}
                        >
                            <h3 className="text-xl font-bold mb-2 text-indigo-700">{key}</h3>
                            <p className="text-sm text-gray-600">{RISK_PROFILES[key].descripcion}</p>
                            <p className="mt-3 text-lg font-semibold text-gray-900">Rendimiento Esperado: {RISK_PROFILES[key].rendimiento_esperado}</p>
                        </div>
                    ))}
                </div>
                <button
                    onClick={handleSave}
                    className="mt-6 px-6 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition shadow-md"
                >
                    Guardar Perfil Seleccionado
                </button>
            </div>

            {/* Recomendación y Visualización */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-lg">
                    <h2 className="text-2xl font-bold text-gray-800 mb-4">2. Recomendación de Asignación de Activos</h2>
                    <p className="text-lg font-semibold mb-4 text-gray-700">Perfil Actual: <span className="text-indigo-600">{currentProfile.descripcion}</span></p>

                    <div className="h-80 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={currentProfile.allocation}
                                    dataKey="value"
                                    nameKey="name"
                                    cx="50%"
                                    cy="50%"
                                    outerRadius={80}
                                    fill="#8884d8"
                                    label
                                >
                                    {currentProfile.allocation.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value) => `${value}%`} />
                                <Legend layout="horizontal" align="center" verticalAlign="bottom" />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>

                    <h3 className="text-xl font-bold mt-6 mb-3 text-gray-800">Detalle de Asignación</h3>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activo</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Recomendación (%)</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {currentProfile.allocation.map((item, index) => (
                                    <tr key={index}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-right text-indigo-600">{item.value}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-lg">
                    <h3 className="text-2xl font-bold mb-4 text-gray-800">Guía Rápida</h3>
                    <ul className="space-y-4 text-gray-700">
                        <li className="flex items-start space-x-2">
                            <TrendingUp className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                            <p>Mayor % en Renta Variable (RV) implica mayor potencial de crecimiento a largo plazo.</p>
                        </li>
                        <li className="flex items-start space-x-2">
                            <PiggyBank className="w-5 h-5 text-yellow-500 mt-1 flex-shrink-0" />
                            <p>Mayor % en Renta Fija (RF) implica mayor estabilidad y menor volatilidad.</p>
                        </li>
                        <li className="flex items-start space-x-2">
                            <BarChart3 className="w-5 h-5 text-indigo-500 mt-1 flex-shrink-0" />
                            <p>Revisa la Proyección de Inversión en el Dashboard para ver el impacto de tu riesgo.</p>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
};


// --- COMPONENTE PRINCIPAL ---

const App = () => {
    const [page, setPage] = useState('dashboard');
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [userId, setUserId] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [healthData, setHealthData] = useState({ investmentCapital: 0, totalDebt: 0, emergencyFund: 0, userId: null });
    const [portfolioData, setPortfolioData] = useState({ riskProfile: 'Moderado', updatedAt: null });
    const [showTransactionModal, setShowTransactionModal] = useState(false);
    const [loading, setLoading] = useState(true);

    // 1. Manejo de Autenticación
    useEffect(() => {
        if (!auth) {
            setLoading(false);
            return;
        }

        const setupAuth = async () => {
            try {
                if (typeof __initial_auth_token !== 'undefined') {
                    await signInWithCustomToken(auth, __initial_auth_token);
                } else {
                    await signInAnonymously(auth);
                }
            } catch (error) {
                console.error("Error during Firebase sign-in:", error);
            }
        };

        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                setUserId(user.uid);
                setHealthData(prev => ({ ...prev, userId: user.uid }));
            } else {
                setUserId(null);
                setHealthData(prev => ({ ...prev, userId: null }));
            }
            setIsAuthReady(true);
            setLoading(false);
        });

        setupAuth();
        return () => unsubscribe();
    }, []);

    // 2. Fetch de Datos (Transactions, Health, Portfolio)
    useEffect(() => {
        if (!isAuthReady || !userId || !db) return;

        // Listener para Transacciones
        const qTransactions = query(getUserCollectionRef(userId, 'transactions'), orderBy('date', 'desc'));
        const unsubscribeT = onSnapshot(qTransactions, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTransactions(list);
        }, (error) => console.error("Error fetching transactions:", error));

        // Listener para Métricas de Salud (Documento 'healthMetrics' en colección 'profile')
        const healthDocRef = doc(getUserCollectionRef(userId, 'profile'), 'healthMetrics');
        const unsubscribeH = onSnapshot(healthDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setHealthData(prev => ({ ...prev, ...docSnap.data() }));
            }
        }, (error) => console.error("Error fetching health data:", error));

        // Listener para Portafolio (Documento 'portfolio' en colección 'profile')
        const portfolioDocRef = doc(getUserCollectionRef(userId, 'profile'), 'portfolio');
        const unsubscribeP = onSnapshot(portfolioDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setPortfolioData(docSnap.data());
            }
        }, (error) => console.error("Error fetching portfolio data:", error));

        return () => {
            unsubscribeT();
            unsubscribeH();
            unsubscribeP();
        };
    }, [isAuthReady, userId]);

    // Renderizado de Carga/Error
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                <p className="ml-3 text-lg text-gray-600">Cargando aplicación financiera...</p>
            </div>
        );
    }

    if (!isAuthReady || !userId) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-red-100 p-8">
                <p className="text-xl text-red-700">Error: No se pudo autenticar al usuario. Revise la configuración de Firebase.</p>
            </div>
        );
    }

    // Renderizado Principal
    const renderContent = () => {
        switch (page) {
            case 'dashboard':
                return <DashboardPanel transactions={transactions} healthData={healthData} portfolioData={portfolioData} />;
            case 'transactions':
                return <TransactionsPanel userId={userId} transactions={transactions} />;
            case 'portfolio':
                return <PortfolioPanel userId={userId} portfolioData={portfolioData} />;
            default:
                return <DashboardPanel transactions={transactions} healthData={healthData} portfolioData={portfolioData} />;
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 font-sans antialiased flex">
            {showTransactionModal && <AddTransactionModal userId={userId} onClose={() => setShowTransactionModal(false)} />}

            {/* Sidebar de Navegación */}
            <nav className="w-64 bg-white shadow-xl p-6 flex flex-col justify-between fixed h-full z-10">
                <div>
                    <h1 className="text-3xl font-extrabold text-indigo-700 mb-10 border-b pb-4">
                        Finanzas Pro
                    </h1>
                    <div className="space-y-2">
                        <NavItem title="Dashboard" icon={Home} current={page === 'dashboard'} onClick={() => setPage('dashboard')} />
                        <NavItem title="Transacciones" icon={BarChart3} current={page === 'transactions'} onClick={() => setPage('transactions')} />
                        <NavItem title="Portafolio" icon={TrendingUp} current={page === 'portfolio'} onClick={() => setPage('portfolio')} />
                    </div>

                    <button
                        onClick={() => setShowTransactionModal(true)}
                        className="w-full mt-8 flex items-center justify-center space-x-2 px-4 py-3 bg-green-500 text-white font-bold rounded-xl shadow-lg hover:bg-green-600 transition duration-200"
                    >
                        <PlusCircle className="w-5 h-5" />
                        <span>Nueva Transacción</span>
                    </button>
                </div>

                <div className="border-t pt-4">
                    <p className="text-sm font-mono text-gray-500 truncate mb-2">
                        Usuario ID: <span title={userId}>{userId}</span>
                    </p>
                    <button
                        onClick={() => auth?.signOut()}
                        className="w-full flex items-center space-x-2 text-red-500 p-2 rounded-lg hover:bg-red-50 transition duration-150"
                    >
                        <LogOut className="w-5 h-5" />
                        <span className="font-semibold">Cerrar Sesión</span>
                    </button>
                </div>
            </nav>

            {/* Contenido Principal */}
            <main className="flex-1 transition-all duration-300 ml-64">
                {renderContent()}
            </main>
        </div>
    );
};

export default App;