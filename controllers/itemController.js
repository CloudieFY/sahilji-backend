const Item = require('../models/Item');
const { ItemStatus } = require('../types');
const XLSX = require('xlsx');

// GET /api/items - list all or filter by status
exports.getItems = async (req, res) => {
  try {
    const { status } = req.query;
    const query = status ? { status } : {};
    const items = await Item.find(query).sort({ createdAt: -1 }).lean();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/items/:id
exports.getItem = async (req, res) => {
  try {
    const item = await Item.findOne({ customId: req.params.id });
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/items
exports.createItem = async (req, res) => {
  try {
    const item = new Item(req.body);
    await item.save();
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// PATCH /api/items/:id
exports.updateItem = async (req, res) => {
  try {
    const item = await Item.findOneAndUpdate(
      { customId: req.params.id },
      req.body,
      { new: true }
    );
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// DELETE /api/items/:id
exports.deleteItem = async (req, res) => {
  try {
    const item = await Item.findOneAndDelete({ customId: req.params.id });
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json({ message: 'Item deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/items/upload-excel
exports.uploadExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    let jsonData;
    if (req.file.mimetype === 'text/csv' || req.file.originalname.endsWith('.csv')) {
      // Handle CSV files
      const csvText = req.file.buffer.toString('utf-8');
      const lines = csvText.split('\n').filter(line => line.trim());
      if (lines.length === 0) {
        return res.status(400).json({ error: 'CSV file is empty' });
      }
      const headers = lines[0].split(',').map(h => h.trim());
      jsonData = lines.slice(1).map(line => {
        const values = line.split(',');
        const obj = {};
        headers.forEach((header, index) => {
          obj[header] = values[index]?.trim() || '';
        });
        return obj;
      });
    } else {
      // Handle Excel files
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      jsonData = XLSX.utils.sheet_to_json(worksheet);
    }

    if (jsonData.length === 0) {
      return res.status(400).json({ error: 'File is empty or no valid data found' });
    }

    const items = [];
    const errors = [];

    for (let i = 0; i < jsonData.length; i++) {
      const row = jsonData[i];
      try {
        const itemData = {
          name: row.name || row.Name,
          designer: row.designer || row.Designer,
          category: row.category || row.Category,
          subcategory: row.subcategory || row.Subcategory,
          size: row.size || row.Size,
          color: row.color || row.Color,
          pricePerDay: parseFloat(row.pricePerDay || row['Price Per Day'] || row.price_per_day),
          retailValue: parseFloat(row.retailValue || row['Retail Value'] || row.retail_value),
          quantity: Math.max(0, parseInt(row.quantity || row.Quantity || row.qty || row.Qty || 1, 10) || 1),
          image: row.image || row.Image || '',
          status: ItemStatus.AVAILABLE,
          timesRented: 0
        };

        // Validate required fields
        if (!itemData.name || !itemData.designer || !itemData.category || 
            !itemData.subcategory || !itemData.size || !itemData.color ||
            isNaN(itemData.pricePerDay) || isNaN(itemData.retailValue)) {
          errors.push(`Row ${i + 2}: Missing or invalid required fields`);
          continue;
        }

        const item = new Item(itemData);
        await item.save();
        items.push(item);
      } catch (err) {
        errors.push(`Row ${i + 2}: ${err.message}`);
      }
    }

    res.status(201).json({
      message: `Successfully uploaded ${items.length} items`,
      items: items.map(item => ({ id: item.customId, name: item.name })),
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
