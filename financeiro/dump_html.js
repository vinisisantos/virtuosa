const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto('http://localhost:3000/pedidos', { waitUntil: 'networkidle0' });

    // Change first order to 'Pedido Feito'
    await page.select('table tbody tr:first-child select', 'Pedido');
    await new Promise(r => setTimeout(r, 1000));

    // Get the HTML of the entire first tr
    const html = await page.evaluate(() => {
        return document.querySelector('table tbody tr:first-child').outerHTML;
    });

    console.log(html);
    await browser.close();
})();
