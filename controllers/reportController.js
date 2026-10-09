const Report = require('../models/Report');

// @desc    Get reports with filters
// @route   GET /api/reports
// @access  Private (Admin / Staff)
const getReports = async (req, res, next) => {
  try {
    const { search, reportType, period } = req.query;
    const query = {};

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { reportName: searchRegex },
        { reportId: searchRegex },
        { department: searchRegex },
        { generatedBy: searchRegex },
        { description: searchRegex },
      ];
    }

    if (reportType && reportType !== 'All') {
      query.type = reportType;
    }

    if (period && period !== 'All') {
      query.period = period;
    }

    const reports = await Report.find(query).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: reports.length,
      data: reports,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single report
// @route   GET /api/reports/:id
// @access  Private
const getReportById = async (req, res, next) => {
  try {
    const { id } = req.params;
    let report;

    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      report = await Report.findById(id);
    } else {
      report = await Report.findOne({ reportId: id });
    }

    if (!report) {
      return res.status(404).json({
        success: false,
        message: `Report not found with ID ${id}`,
      });
    }

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new report
// @route   POST /api/reports
// @access  Private (Admin / Staff)
const createReport = async (req, res, next) => {
  try {
    const { reportName, type, department, period, records, description } = req.body;

    if (!reportName) {
      return res.status(400).json({
        success: false,
        message: 'Report name is required',
      });
    }

    const count = await Report.countDocuments();
    const reportId = req.body.reportId || `REP-${1001 + count}`;

    const report = await Report.create({
      reportId,
      reportName,
      type: type || 'General',
      department: department || 'All Departments',
      generatedBy: req.user ? req.user.name : 'Admin',
      period: period || 'Monthly',
      records: records ? Number(records) : 0,
      status: 'Completed',
      description: description || '',
    });

    res.status(201).json({
      success: true,
      message: 'Report created successfully',
      data: report,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a report
// @route   DELETE /api/reports/:id
// @access  Private (Admin only)
const deleteReport = async (req, res, next) => {
  try {
    const { id } = req.params;
    let report = await Report.findById(id);

    if (!report) {
      report = await Report.findOne({ reportId: id });
    }

    if (!report) {
      return res.status(404).json({
        success: false,
        message: `Report not found with ID ${id}`,
      });
    }

    await Report.findByIdAndDelete(report._id);

    res.status(200).json({
      success: true,
      message: 'Report deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getReports,
  getReportById,
  createReport,
  deleteReport,
};
