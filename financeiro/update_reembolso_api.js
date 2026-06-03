const fs = require('fs');
const path = require('path');

const routeTs = path.join(__dirname, 'src/app/api/reembolso/route.ts');
let content = fs.readFileSync(routeTs, 'utf8');

// Update POST to allow creating an empty draft ticket without items/attachments
content = content.replace(/if \(!items \|\| !items\.length\) return NextResponse\.json\(\{ error: 'Pelo menos um produto é obrigatório' \}, \{ status: 400 \}\);/, '');
content = content.replace(/if \(!attachments \|\| !attachments\.length\) return NextResponse\.json\(\{ error: 'Pelo menos um anexo\/comprovante é obrigatório' \}, \{ status: 400 \}\);/, '');
content = content.replace(/const totalAmount = items\.reduce.*?/, 'const totalAmount = (items || []).reduce((sum: number, item: any) => sum + (item.price || 0), 0);');
content = content.replace(/items: {[\s\S]*?},/, `items: items && items.length > 0 ? {
          create: items.map((item: any) => ({
            name: item.name, price: item.price || 0,
            expenseDate: item.expenseDate ? new Date(item.expenseDate) : null,
            description: item.description || null,
          })),
        } : undefined,`);
content = content.replace(/attachments: {[\s\S]*?},/, `attachments: attachments && attachments.length > 0 ? {
          create: attachments.map((att: any) => ({
            fileName: att.fileName, fileType: att.fileType, fileSize: att.fileSize, fileData: att.fileData
          })),
        } : undefined,`);
content = content.replace(/status: 'pendente'/g, "status: body.status || 'pendente'");

// Update PUT valid statuses to include rascunho
content = content.replace(/const validStatuses = \['pendente', 'aprovado', 'reprovado', 'pago', 'parcialmente_reembolsado', 'reembolsado', 'finalizado'\];/,
  "const validStatuses = ['rascunho', 'pendente', 'aprovado', 'reprovado', 'pago', 'parcialmente_reembolsado', 'reembolsado', 'finalizado'];");

// Ensure item editing in PUT supports expenseDate and description
const editItemRegex = /if \(itemEdit\.price !== undefined[\s\S]*?\}/;
content = content.replace(editItemRegex, `$&
          if (itemEdit.expenseDate !== undefined) {
            itemUpdate.expenseDate = itemEdit.expenseDate ? new Date(itemEdit.expenseDate) : null;
          }
          if (itemEdit.description !== undefined && itemEdit.description !== currentItem.description) {
            itemUpdate.description = itemEdit.description;
          }`);

fs.writeFileSync(routeTs, content);


const itemsRouteTs = path.join(__dirname, 'src/app/api/reembolso/items/route.ts');
let itemsContent = fs.readFileSync(itemsRouteTs, 'utf8');

// Add POST for creating new item inside an existing ticket
if (!itemsContent.includes('export async function POST')) {
  itemsContent += `
export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

  try {
    const { ticketId, name, price, expenseDate, description } = await req.json();
    if (!ticketId || !name) return NextResponse.json({ error: 'Faltam dados' }, { status: 400 });

    const newItem = await prisma.reembolsoItem.create({
      data: {
        ticketId, name, price: Number(price) || 0,
        expenseDate: expenseDate ? new Date(expenseDate) : null,
        description: description || null,
      }
    });

    const ticketItems = await prisma.reembolsoItem.findMany({ where: { ticketId } });
    const totalAmount = ticketItems.reduce((s: number, i: any) => s + i.price, 0);
    const reimbursedAmount = ticketItems.filter((i: any) => i.isReimbursed).reduce((s: number, i: any) => s + i.price, 0);

    const updatedTicket = await prisma.reembolsoTicket.update({
      where: { id: ticketId },
      data: { totalAmount, reimbursedAmount },
      include: { items: true, attachments: { select: { id: true, fileName: true, fileType: true, fileSize: true, createdAt: true } } },
    });

    return NextResponse.json(updatedTicket);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;
  try {
    const itemId = req.nextUrl.searchParams.get('id');
    if (!itemId) return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    
    const item = await prisma.reembolsoItem.findUnique({ where: { id: itemId }});
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await prisma.reembolsoItem.delete({ where: { id: itemId }});

    const ticketItems = await prisma.reembolsoItem.findMany({ where: { ticketId: item.ticketId } });
    const totalAmount = ticketItems.reduce((s: number, i: any) => s + i.price, 0);
    const reimbursedAmount = ticketItems.filter((i: any) => i.isReimbursed).reduce((s: number, i: any) => s + i.price, 0);

    const updatedTicket = await prisma.reembolsoTicket.update({
      where: { id: item.ticketId },
      data: { totalAmount, reimbursedAmount },
      include: { items: true, attachments: { select: { id: true, fileName: true, fileType: true, fileSize: true, createdAt: true } } },
    });

    return NextResponse.json(updatedTicket);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
`;
  fs.writeFileSync(itemsRouteTs, itemsContent);
}

console.log('API routes updated for Rascunho & Item creation/deletion.');
