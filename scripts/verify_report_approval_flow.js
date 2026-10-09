const http = require('http');

const request = (options, postData = null) => {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(JSON.stringify(postData));
    }
    req.end();
  });
};

const login = async (email, password) => {
  const res = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email, password }
  );
  if (res.status !== 200 || !res.data?.token) {
    throw new Error(`Login failed for ${email}: ${JSON.stringify(res.data)}`);
  }
  return res.data.token;
};

async function run() {
  console.log('=== STARTING CLINICAL REPORT APPROVAL FLOW VERIFICATION ===\n');

  // 1. Login as Doctor
  console.log('Step 1: Logging in as Doctor (rajesh@medcare.com)...');
  const doctorToken = await login('rajesh@medcare.com', 'Doctor@123');
  console.log('Doctor logged in successfully.\n');

  // Find or create an appointment for Arun Kumar
  const aptsRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/appointments',
    method: 'GET',
    headers: { Authorization: `Bearer ${doctorToken}` },
  });

  let targetApt = (aptsRes.data?.data || []).find(
    (a) => a.patientName && a.patientName.toLowerCase().includes('arun')
  );

  if (!targetApt && (aptsRes.data?.data || []).length > 0) {
    targetApt = aptsRes.data?.data[0];
  }

  if (!targetApt) {
    throw new Error('No appointment found to attach report to!');
  }

  console.log(`Found appointment for clinical report: ${targetApt.appointmentId || targetApt._id} (${targetApt.patientName})\n`);

  // 2. Doctor issues Clinical Report
  console.log('Step 2: Doctor issues a new clinical report from doctorReport...');
  const reportPayload = {
    appointment: targetApt._id,
    patientName: targetApt.patientName,
    diagnosis: 'Acute Pharyngitis & Upper Respiratory Infection',
    symptoms: 'Sore throat, fever 101F, mild dry cough',
    chiefComplaint: 'Difficulty swallowing and throat discomfort for 3 days',
    findings: 'Erythematous posterior pharynx, no tonsillar exudate',
    treatment: 'Warm saline gargle, hydration, oral analgesics',
    doctorNotes: 'Monitor temperature and follow up if symptoms worsen',
    followUpRecommendation: 'Review after 5 days if throat discomfort persists',
    submitForApproval: true,
  };

  const createReportRes = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/medical-reports',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${doctorToken}`,
      },
    },
    reportPayload
  );

  console.log('Create Report Status:', createReportRes.status);
  const createdReport = createReportRes.data?.data;
  console.log('Created Clinical Report:', {
    reportId: createdReport?.reportId,
    status: createdReport?.status,
    isApproved: createdReport?.approval?.isApproved,
    patientName: createdReport?.patient?.name || createdReport?.patientName,
  });

  if (!createdReport || createdReport.status !== 'pending_approval' || createdReport.approval?.isApproved !== false) {
    throw new Error(`Report was NOT created with pending_approval status! Status is: ${createdReport?.status}`);
  }
  console.log('✓ Verified: Doctor report created with status: pending_approval and isApproved: false\n');

  // 3. Login as Patient
  console.log('Step 3: Logging in as Patient (arun@gmail.com)...');
  const patientToken = await login('arun@gmail.com', 'Patient@123');
  console.log('Patient logged in successfully.\n');

  // 4. Check client reports BEFORE admin approval
  console.log('Step 4: Checking client reports BEFORE admin approval...');
  const clientReportsBefore = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/medical-reports',
    method: 'GET',
    headers: { Authorization: `Bearer ${patientToken}` },
  });

  const foundInClientBefore = (clientReportsBefore.data?.data || []).some(
    (r) => r.reportId === createdReport.reportId
  );
  console.log(`Is ${createdReport.reportId} visible to client before approval?:`, foundInClientBefore);

  if (foundInClientBefore) {
    throw new Error('FAILED: Unapproved clinical report is visible in client reports file before admin approval!');
  }

  // Also check direct get by ID for patient
  const singleReportBefore = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/medical-reports/${createdReport._id}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${patientToken}` },
  });
  console.log(`Direct report access by patient status code (should be 403):`, singleReportBefore.status);
  if (singleReportBefore.status !== 403) {
    throw new Error('FAILED: Client was able to access unapproved report directly by ID!');
  }
  console.log('✓ Verified: Report is strictly NOT visible or accessible to client before admin approval!\n');

  // 5. Login as Admin
  console.log('Step 5: Logging in as Admin (admin@medcare.com)...');
  const adminToken = await login('admin@medcare.com', 'Admin@123');
  console.log('Admin logged in successfully.\n');

  // 6. Admin checks Report Approvals
  console.log('Step 6: Checking Admin Report Approvals for pending report...');
  const pendingReportsRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/medical-reports?status=pending_approval',
    method: 'GET',
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  const matchedReport = (pendingReportsRes.data?.data || []).find(
    (r) => r.reportId === createdReport.reportId || r._id === createdReport._id
  );

  if (!matchedReport) {
    throw new Error(`FAILED: Could not find report ${createdReport.reportId} in Admin pending approvals!`);
  }
  console.log('Found Report in Admin Report Approvals:', {
    reportId: matchedReport.reportId,
    patientName: matchedReport.patient?.name || matchedReport.patientName,
    diagnosis: matchedReport.diagnosis,
    status: matchedReport.status,
  });
  console.log('✓ Verified: Report appears in Admin Report Approvals with status: pending_approval\n');

  // 7. Admin Approves the Report
  console.log(`Step 7: Admin approving Report ${matchedReport.reportId}...`);
  const approveRes = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: `/api/medical-reports/${matchedReport._id}/approve`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    },
    {}
  );

  console.log('Admin Approve Response Status:', approveRes.status);
  console.log('Approve Message:', approveRes.data?.message);
  if (approveRes.status !== 200) {
    throw new Error(`Admin approval failed: ${JSON.stringify(approveRes.data)}`);
  }
  console.log('✓ Verified: Admin successfully approved the report!\n');

  // 8. Check client reports AFTER admin approval
  console.log('Step 8: Checking client reports AFTER admin approval...');
  const clientReportsAfter = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/medical-reports',
    method: 'GET',
    headers: { Authorization: `Bearer ${patientToken}` },
  });

  const foundInClientAfter = (clientReportsAfter.data?.data || []).find(
    (r) => r.reportId === createdReport.reportId
  );
  console.log(`Is ${createdReport.reportId} visible to client after approval?:`, !!foundInClientAfter);

  if (!foundInClientAfter) {
    throw new Error(`FAILED: Approved report ${createdReport.reportId} does not appear in client reports file!`);
  }

  console.log('Approved Report details in client reports:', {
    reportId: foundInClientAfter.reportId,
    status: foundInClientAfter.status,
    diagnosis: foundInClientAfter.diagnosis,
    treatment: foundInClientAfter.treatment,
    approvedByName: foundInClientAfter.approval?.approvedByName,
  });
  console.log('✓ Verified: Clinical report NOW appears in client reports file!\n');

  // 9. Check Doctor view
  console.log('Step 9: Verifying Doctor reports view...');
  const doctorReportRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/medical-reports/${createdReport._id}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${doctorToken}` },
  });

  console.log('Doctor Report View:', {
    reportId: doctorReportRes.data?.data?.reportId,
    status: doctorReportRes.data?.data?.status,
    isApproved: doctorReportRes.data?.data?.approval?.isApproved,
    approvedByName: doctorReportRes.data?.data?.approval?.approvedByName,
  });

  if (doctorReportRes.data?.data?.status !== 'approved') {
    throw new Error('Report status was NOT updated to approved in doctor view!');
  }
  console.log('✓ Verified: Doctor report status is updated to approved!\n');

  // 10. Rejection Flow Verification
  console.log('Step 10: Verifying Rejection Flow...');
  const rejReportRes = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/medical-reports',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${doctorToken}`,
      },
    },
    {
      appointment: targetApt._id,
      patientName: targetApt.patientName,
      diagnosis: 'Tension Headache',
      submitForApproval: true,
    }
  );

  const rejReport = rejReportRes.data?.data;
  console.log(`Doctor created report for rejection test: ${rejReport.reportId}`);

  // Admin rejects report
  const adminRejRes = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: `/api/medical-reports/${rejReport._id}/reject`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    },
    { rejectionReason: 'Incomplete physical examination notes.' }
  );

  console.log('Admin Reject Status:', adminRejRes.status);

  // Client checks reports
  const clientReportsRej = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/medical-reports',
    method: 'GET',
    headers: { Authorization: `Bearer ${patientToken}` },
  });
  const clientHasRej = (clientReportsRej.data?.data || []).some((r) => r.reportId === rejReport.reportId);
  console.log(`Is rejected report visible to client?: ${clientHasRej}`);

  if (clientHasRej) {
    throw new Error('FAILED: Rejected report is visible to client!');
  }
  console.log('✓ Verified: Rejected report remains strictly hidden from client!\n');

  console.log('=== ALL CLINICAL REPORT APPROVAL TESTS PASSED SUCCESSFULLY! ===');
}

run().catch((err) => {
  console.error('\n❌ ERROR:', err);
  process.exit(1);
});
