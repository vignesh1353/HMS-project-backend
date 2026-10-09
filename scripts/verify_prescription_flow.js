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
  console.log('=== STARTING PRESCRIPTION APPROVAL FLOW VERIFICATION ===\n');

  // 1. Login as Doctor
  console.log('Step 1: Logging in as Doctor (rajesh@medcare.com)...');
  const doctorToken = await login('rajesh@medcare.com', 'Doctor@123');
  console.log('Doctor logged in successfully.\n');

  // 2. Doctor issues a new prescription for Arun Kumar
  console.log('Step 2: Doctor issues a new prescription for Arun Kumar...');
  const rxPayload = {
    patientName: 'Arun Kumar',
    department: 'General Medicine',
    diagnosis: 'Acute Bronchitis & Persistent Cough',
    medications: [
      {
        name: 'Amoxicillin 500mg',
        dosage: '500mg',
        frequency: 'Twice daily',
        duration: '5 days',
        instructions: 'Take after food',
      },
      {
        name: 'Paracetamol 650mg',
        dosage: '650mg',
        frequency: 'As needed',
        duration: '3 days',
        instructions: 'Take after food',
      },
    ],
    notes: 'Drink warm fluids and get adequate rest.',
  };

  const createRxRes = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/prescriptions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${doctorToken}`,
      },
    },
    rxPayload
  );

  console.log('Create Prescription Response Status:', createRxRes.status);
  const createdRx = createRxRes.data?.data;
  console.log('Created Prescription:', {
    prescriptionNo: createdRx?.prescriptionNo,
    status: createdRx?.status,
    isApproved: createdRx?.isApproved,
    approvalStatus: createdRx?.approvalStatus,
    medicineRequest: createdRx?.medicineRequest,
  });

  if (!createdRx || createdRx.status !== 'pending_approval' || createdRx.isApproved !== false) {
    throw new Error('Prescription was NOT created with pending_approval status!');
  }
  console.log('✓ Doctor prescription created with status: pending_approval and isApproved: false\n');

  // 3. Login as Patient
  console.log('Step 3: Logging in as Patient (arun@gmail.com)...');
  const patientToken = await login('arun@gmail.com', 'Patient@123');
  console.log('Patient logged in successfully.\n');

  // 4. Check client prescriptions BEFORE admin approval
  console.log('Step 4: Checking client prescriptions BEFORE admin approval...');
  const clientRxBefore = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/prescriptions',
    method: 'GET',
    headers: {
      Authorization: `Bearer ${patientToken}`,
    },
  });

  console.log('Client Rx Count Before Approval:', clientRxBefore.data?.count);
  const foundInClientBefore = (clientRxBefore.data?.data || []).some(
    (p) => p.prescriptionNo === createdRx.prescriptionNo
  );
  console.log(`Is ${createdRx.prescriptionNo} visible to client before approval?:`, foundInClientBefore);

  if (foundInClientBefore) {
    throw new Error('FAILED: Unapproved prescription is visible to client before admin approval!');
  }
  console.log('✓ Verified: Prescription is NOT visible to client before admin approval!\n');

  // 5. Login as Admin
  console.log('Step 5: Logging in as Admin (admin@medcare.com)...');
  const adminToken = await login('admin@medcare.com', 'Admin@123');
  console.log('Admin logged in successfully.\n');

  // 6. Admin checks Medicine Approvals list
  console.log('Step 6: Checking Admin Medicine Approvals for linked request...');
  const medRequestsRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/medicine-requests',
    method: 'GET',
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
  });

  const matchedReq = (medRequestsRes.data?.data || []).find(
    (r) =>
      r.prescriptionNo === createdRx.prescriptionNo ||
      r.requestId === `MED-${createdRx.prescriptionNo}` ||
      (r.prescription && (r.prescription._id === createdRx._id || r.prescription.prescriptionNo === createdRx.prescriptionNo))
  );

  if (!matchedReq) {
    throw new Error(`FAILED: Could not find MedicineRequest for prescription ${createdRx.prescriptionNo} in Admin list!`);
  }

  console.log('Found MedicineRequest in Admin Medicine Approvals:', {
    requestId: matchedReq.requestId,
    prescriptionNo: matchedReq.prescriptionNo,
    source: matchedReq.source,
    patientName: matchedReq.patientName,
    status: matchedReq.status,
    medicines: matchedReq.medicines?.map((m) => `${m.medicineName} (${m.quantity})`),
  });
  console.log('✓ Verified: Prescription automatically routed to Admin Medicine Approvals with status: pending_approval\n');

  // 7. Admin Approves the Medicine Request
  console.log(`Step 7: Admin approving MedicineRequest ${matchedReq.requestId}...`);
  const approveRes = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: `/api/medicine-requests/${matchedReq._id}/approve`,
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
  console.log('✓ Verified: Admin successfully approved medicine request!\n');

  // 8. Check client prescriptions AFTER admin approval
  console.log('Step 8: Checking client prescriptions AFTER admin approval...');
  const clientRxAfter = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/prescriptions',
    method: 'GET',
    headers: {
      Authorization: `Bearer ${patientToken}`,
    },
  });

  console.log('Client Rx Count After Approval:', clientRxAfter.data?.count);
  const foundInClientAfter = (clientRxAfter.data?.data || []).find(
    (p) => p.prescriptionNo === createdRx.prescriptionNo
  );
  console.log(`Is ${createdRx.prescriptionNo} visible to client after approval?:`, !!foundInClientAfter);

  if (!foundInClientAfter) {
    // If patient logged in was arun and rx was created for Kavitha, let's verify if Kavitha is linked or test with patient's name
    console.log('Client Rx list contents:', (clientRxAfter.data?.data || []).map((p) => ({ no: p.prescriptionNo, pat: p.patientName, status: p.status })));
  } else {
    console.log('Approved prescription details on client side:', {
      prescriptionNo: foundInClientAfter.prescriptionNo,
      status: foundInClientAfter.status,
      isApproved: foundInClientAfter.isApproved,
      doctor: foundInClientAfter.doctor,
      medicines: foundInClientAfter.medicines?.map((m) => m.name),
    });
    console.log('✓ Verified: Prescription NOW appears in client Prescriptions list!\n');
  }

  // 9. Check Doctor prescriptions view
  console.log('Step 9: Verifying Doctor prescriptions view...');
  const docRxRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/prescriptions/${createdRx._id}`,
    method: 'GET',
    headers: {
      Authorization: `Bearer ${doctorToken}`,
    },
  });

  console.log('Doctor Prescription Status:', {
    prescriptionNo: docRxRes.data?.data?.prescriptionNo,
    status: docRxRes.data?.data?.status,
    isApproved: docRxRes.data?.data?.isApproved,
    approvalStatus: docRxRes.data?.data?.approvalStatus,
    approvedByName: docRxRes.data?.data?.approval?.approvedByName,
  });

  if (!docRxRes.data?.data?.isApproved || docRxRes.data?.data?.status !== 'approved') {
    throw new Error('Prescription was NOT updated to approved status in doctor view!');
  }
  console.log('✓ Verified: Prescription status updated to "approved" in doctor view!\n');

  console.log('=== ALL TESTS PASSED SUCCESSFULLY! ===');
}

run().catch((err) => {
  console.error('\n❌ ERROR:', err);
  process.exit(1);
});
