require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app = express();

// ─────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(
  '/uploads',
  express.static(path.join(__dirname, '../uploads'))
);

// ─────────────────────────────────────────────
// ROUTE IMPORTS
// ─────────────────────────────────────────────

const processRoutes        = require('./routes/process');
const qualityRoutes        = require('./routes/qualityRoutes');
const quantityRoutes       = require('./routes/quantityRoutes');
const yardageRoutes        = require('./routes/yardageRoutes');
const priceRoutes          = require('./routes/priceRoutes');
const orderRoutes          = require('./routes/orderRoutes');
const jobWorksRouter       = require('./routes/fabricPurchaseOrders');

const customerMasterRoutes = require('./routes/customerMasterRoutes');
const transportRoutes      = require('./routes/transportMasterRoutes');
const agentRoutes          = require('./routes/agentMasterRoutes');
const vendorRoutes         = require('./routes/vendorMasterRoutes');
const supplierRoutes       = require('./routes/supplierMasterRoutes');

const customerRoutes       = require('./routes/customerMasterRoutes');
const serviceTypeRoutes    = require('./routes/serviceTypeMasterRoutes');
const packageRoutes        = require('./routes/packageMasterRoutes');
const regionRoutes         = require('./routes/regionMasterRoutes');
const customerGroupRoutes  = require('./routes/customerGroupRoutes');
const processingTypeRoutes = require('./routes/processingTypeRoutes');
const paymentTermsRoutes   = require('./routes/paymentTermsRoutes');
const colorRoutes          = require('./routes/colorRoutes');
const certificationRoutes  = require('./routes/certificationRoutes');
const hsnRoutes            = require('./routes/hsnRoutes');
const currencyRoutes       = require('./routes/currencyMasterRoutes');
const discountTypeRoutes   = require('./routes/discountTypeMasterRoutes');
const productionMasterRoutes     = require('./routes/production');
const productionPlanningRoutes   = require('./routes/production'); // ← NEW
const workOrderRoutes            = require('./routes/workOrders');               // ← NEW

const yarnPurchaseOrderRoutes = require('./routes/yarnPurchaseOrders');
app.use('/api/yarn-purchase-orders', yarnPurchaseOrderRoutes);

const yarnPurchaseInwardRoute  = require('./routes/yarnPurchaseInward');
app.use('/api/yarn-purchase-inward', yarnPurchaseInwardRoute);

const employeeRoutes = require('./routes/employeeRoute');
app.use('/api/employees', employeeRoutes);


const orderStatusRoutes = require('./routes/orderStatusRoute');
app.use('/api/order-status', orderStatusRoutes);

const clientProfileRoutes = require('./routes/notifications_routes');
app.use('/api', clientProfileRoutes);

const {
  yarnRouter,
  yarnTypeRouter,
  countSystemRouter,
} = require('./routes/yarnMasterRoutes');

const inwardRoutes  = require('./routes/inward');
const chatRouter    = require('./routes/chat');
const reportsRoutes = require('./routes/reports');
const fabricRoutes  = require('./routes/fabricMasterRoutes');

const convRouter = require('./routes/orderConversions');

// ─────────────────────────────────────────────
// CORE ROUTES
// ─────────────────────────────────────────────

app.use('/api/auth',                   require('./routes/auth'));
app.use('/api/dashboard',              require('./routes/dashboard'));
app.use('/api/dispatch',               require('./routes/dispatch'));
app.use('/api/dyeing',                 require('./routes/dyeing'));
app.use('/api/fabric-purchase-inward', require('./routes/inward'));
app.use('/api/inward-processed',       require('./routes/inwardProcessed'));
app.use('/api/customer-orders',        require('./routes/orderRoutes'));
app.use('/api/order-bookings',         require('./routes/orderBookings'));
app.use('/api/outward',                require('./routes/outward'));
app.use('/api/sample-requests',        require('./routes/sampleRequests'));
app.use('/api/development-process',    require('./routes/developmentProcess'));
app.use('/api/dev-analysis',           require('./routes/devAnalysis'));
app.use('/api/yardage-moq',            require('./routes/yardageMoq'));
app.use('/api/price-lists',            require('./routes/priceList'));

// ─────────────────────────────────────────────
// CONVERSION / NOTIFICATION ROUTES
// ─────────────────────────────────────────────

app.use('/api/order-conversions', convRouter);
app.use('/api/notifications',     convRouter.notif);

// ─────────────────────────────────────────────
// MASTER ROUTES
// ─────────────────────────────────────────────

app.use('/api/currencies',          currencyRoutes);
app.use('/api/discount-types',      discountTypeRoutes);
app.use('/api/certifications',      certificationRoutes);
app.use('/api/hsn',                 hsnRoutes);
app.use('/api/colors',              colorRoutes);
app.use('/api/payment-terms',       paymentTermsRoutes);
app.use('/api/customer-groups',     customerGroupRoutes);
app.use('/api/processing-types',    processingTypeRoutes);
app.use('/api/customers',           customerRoutes);
app.use('/api/service-types',       serviceTypeRoutes);
app.use('/api/packages',            packageRoutes);
app.use('/api/regions',             regionRoutes);
app.use('/api/yarns',               yarnRouter);
app.use('/api/yarn-types',          yarnTypeRouter);
app.use('/api/count-systems',       countSystemRouter);
app.use('/api/transports',          transportRoutes);
app.use('/api/customers',           customerMasterRoutes);
app.use('/api/agents',              agentRoutes);
app.use('/api/vendors',             vendorRoutes);
app.use('/api/suppliers',           supplierRoutes);
app.use('/api/fabrics',             fabricRoutes);
app.use('/api/fabric-masters',      fabricRoutes);
app.use('/api/production-master',   productionMasterRoutes);


app.use('/api/yarn-master', require('./routes/yarnMaster'));       // add this shim
app.use('/api/locations',   require('./routes/locations')); 
app.use('/api', require('./routes/notifications_routes'));


const vendorPickRateMasterRoutes = require('./routes/vendorPickRateMaster');
app.use('/api/vendor-pick-rate-master', vendorPickRateMasterRoutes);

// ─────────────────────────────────────────────
// FUNCTIONAL ROUTES
// ─────────────────────────────────────────────

app.use('/api/reports',                reportsRoutes);
app.use('/api/chat',                   chatRouter);
app.use('/api/inward',                 inwardRoutes);
app.use('/api/fabric-purchase-orders', jobWorksRouter);
app.use('/api/orders',                 orderRoutes);
app.use('/api/process',                processRoutes);
app.use('/api/quality-check',          qualityRoutes);
app.use('/api/quantity-log',           quantityRoutes);
app.use('/api/yardage-moqs',           yardageRoutes);
app.use('/api/price-list',             priceRoutes);

// ─────────────────────────────────────────────
// PRODUCTION PLANNING & WORK ORDERS  ← NEW
// ─────────────────────────────────────────────

app.use('/api/production-plans', productionPlanningRoutes);
app.use('/api/work-orders',      workOrderRoutes);

// ─────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ─────────────────────────────────────────────
// UNHANDLED REJECTION
// ─────────────────────────────────────────────

process.on('unhandledRejection', (reason) => {
  console.error('🔴 Unhandled Rejection:', reason);
});

// ─────────────────────────────────────────────
// GLOBAL ERROR HANDLER
// ─────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal server error' });
});

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`✅  Server running → http://localhost:${PORT}`);
});