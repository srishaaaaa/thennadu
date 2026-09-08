const fs = require('fs');
let content = fs.readFileSync('src/pages/Dashboard.tsx', 'utf8');

// Add import
content = content.replace(
  /import \{ normalizeStructuredOrderItem \} from '\.\.\/lib\/retail'/g,
  "import { normalizeStructuredOrderItem, formatInvoiceNo } from '../lib/retail'"
);

// Replace formats
content = content.replace(/\{o\.invoice_no \|\| '-'\}/g, '{formatInvoiceNo(o.invoice_no)}');
content = content.replace(/\{o\.invoice_no \|\| '—'\}/g, '{formatInvoiceNo(o.invoice_no)}');
content = content.replace(/invoiceNumber: order\.invoice_no \|\| order\.id \|\| '-',/g, 'invoiceNumber: formatInvoiceNo(order.invoice_no || order.id),');
content = content.replace(/aria-label=\{\Invoice \$\{invoicePreviewOrder\.invoice_no \|\| invoicePreviewOrder\.id\}\\}/g, 'aria-label={Invoice }');
content = content.replace(/>\{invoicePreviewOrder\.invoice_no \|\| invoicePreviewOrder\.id\}<\/p>/g, '>{formatInvoiceNo(invoicePreviewOrder.invoice_no || invoicePreviewOrder.id)}</p>');
content = content.replace(/invoiceNo=\{invoicePreviewOrder\.invoice_no \|\| invoicePreviewOrder\.id\}/g, 'invoiceNo={formatInvoiceNo(invoicePreviewOrder.invoice_no || invoicePreviewOrder.id)}');

fs.writeFileSync('src/pages/Dashboard.tsx', content);
