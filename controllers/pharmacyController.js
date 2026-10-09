const Medicine = require('../models/Medicine');

// @desc    Get all medicines with search & category filter
// @route   GET /api/medicines
// @access  Private (Admin / Staff / Doctor)
const getMedicines = async (req, res, next) => {
  try {
    const { search, category, status } = req.query;
    const query = {};

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { name: searchRegex },
        { medicineId: searchRegex },
        { category: searchRegex },
        { manufacturer: searchRegex },
        { batchNo: searchRegex },
        { supplier: searchRegex },
      ];
    }

    if (category && category !== 'All') {
      query.category = category;
    }

    if (status && status !== 'All') {
      query.status = status;
    }

    const medicines = await Medicine.find(query).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: medicines.length,
      data: medicines,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single medicine by ID or medicineId
// @route   GET /api/medicines/:id
// @access  Private
const getMedicineById = async (req, res, next) => {
  try {
    const { id } = req.params;
    let medicine;

    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      medicine = await Medicine.findById(id);
    } else {
      medicine = await Medicine.findOne({ medicineId: id });
    }

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: `Medicine not found with ID ${id}`,
      });
    }

    res.status(200).json({
      success: true,
      data: medicine,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add medicine to inventory
// @route   POST /api/medicines
// @access  Private (Admin / Pharmacist)
const createMedicine = async (req, res, next) => {
  try {
    const {
      name,
      category,
      manufacturer,
      batchNo,
      quantity,
      price,
      expiryDate,
      supplier,
      status,
    } = req.body;

    if (!name || !manufacturer || !batchNo || quantity === undefined || price === undefined || !expiryDate) {
      return res.status(400).json({
        success: false,
        message: 'Name, manufacturer, batch number, quantity, price, and expiry date are required',
      });
    }

    if (Number(quantity) < 0) {
      return res.status(400).json({
        success: false,
        message: 'Quantity cannot be negative',
      });
    }

    if (Number(price) < 0) {
      return res.status(400).json({
        success: false,
        message: 'Price cannot be negative',
      });
    }

    const count = await Medicine.countDocuments();
    const medicineId = req.body.medicineId || `MED-${1001 + count}`;

    const medicine = await Medicine.create({
      medicineId,
      name,
      category: category || 'Tablet',
      manufacturer,
      batchNo,
      quantity: Number(quantity),
      price: Number(price),
      expiryDate,
      supplier: supplier || '',
      status: status || 'Available',
    });

    res.status(201).json({
      success: true,
      message: 'Medicine added to inventory successfully',
      data: medicine,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update medicine
// @route   PUT /api/medicines/:id
// @access  Private (Admin / Pharmacist)
const updateMedicine = async (req, res, next) => {
  try {
    const { id } = req.params;
    let medicine = await Medicine.findById(id);

    if (!medicine) {
      medicine = await Medicine.findOne({ medicineId: id });
    }

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: `Medicine not found with ID ${id}`,
      });
    }

    if (req.body.quantity !== undefined && Number(req.body.quantity) < 0) {
      return res.status(400).json({
        success: false,
        message: 'Quantity cannot be negative',
      });
    }

    const updated = await Medicine.findByIdAndUpdate(
      medicine._id,
      req.body,
      { returnDocument: 'after', runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Medicine updated successfully',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update medicine stock quantity
// @route   PATCH /api/medicines/:id/stock
// @access  Private (Admin / Pharmacist)
const updateStock = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;

    if (quantity === undefined || Number(quantity) < 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid non-negative quantity is required',
      });
    }

    let medicine = await Medicine.findById(id);
    if (!medicine) {
      medicine = await Medicine.findOne({ medicineId: id });
    }

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: `Medicine not found with ID ${id}`,
      });
    }

    medicine.quantity = Number(quantity);
    await medicine.save();

    res.status(200).json({
      success: true,
      message: `Medicine stock updated to ${medicine.quantity}`,
      data: medicine,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete medicine
// @route   DELETE /api/medicines/:id
// @access  Private (Admin only)
const deleteMedicine = async (req, res, next) => {
  try {
    const { id } = req.params;
    let medicine = await Medicine.findById(id);

    if (!medicine) {
      medicine = await Medicine.findOne({ medicineId: id });
    }

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: `Medicine not found with ID ${id}`,
      });
    }

    await Medicine.findByIdAndDelete(medicine._id);

    res.status(200).json({
      success: true,
      message: 'Medicine deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMedicines,
  getMedicineById,
  createMedicine,
  updateMedicine,
  updateStock,
  deleteMedicine,
};
