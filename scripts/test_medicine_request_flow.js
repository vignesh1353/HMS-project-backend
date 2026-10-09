const API_BASE = "http://localhost:5000/api";

async function main() {
  console.log("=== Testing Medicine Request Patient Reference Flow ===");

  // 1. Patient Login (Arun Kumar)
  const patientLoginRes = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "arun@gmail.com", password: "Patient@123" }),
  });
  const patientLoginData = await patientLoginRes.json();
  if (!patientLoginData.token) {
    throw new Error("Patient login failed: " + JSON.stringify(patientLoginData));
  }
  const patientToken = patientLoginData.token;
  console.log("✓ Patient logged in:", patientLoginData.user.name);

  // 2. Fetch Patient Profile via /patients/me/profile
  const profileRes = await fetch(`${API_BASE}/patients/me/profile`, {
    headers: { Authorization: `Bearer ${patientToken}` },
  });
  const profileData = await profileRes.json();
  if (!profileData.success || !profileData.data?.patientId) {
    throw new Error("Failed to retrieve patient profile: " + JSON.stringify(profileData));
  }
  const patientProfile = profileData.data;
  console.log("✓ Patient Profile fetched:", patientProfile.name, "Patient Reference ID:", patientProfile.patientId);

  // 3. Fetch Approved Medical Reports for Patient
  const reportsRes = await fetch(`${API_BASE}/medical-reports?status=approved`, {
    headers: { Authorization: `Bearer ${patientToken}` },
  });
  const reportsData = await reportsRes.json();
  const reports = reportsData.data || [];
  if (reports.length === 0) {
    throw new Error("No approved reports found for patient Arun Kumar!");
  }
  const targetReport = reports[0];
  console.log("✓ Found approved medical report:", targetReport.reportId, "Diagnosis:", targetReport.diagnosis);

  // 4. Submit Medicine Request as Patient
  const submitRes = await fetch(`${API_BASE}/medicine-requests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${patientToken}`,
    },
    body: JSON.stringify({
      reportId: targetReport._id,
      patientId: patientProfile.patientId,
      patientReferenceNumber: patientProfile.patientId,
      medicines: [
        {
          medicineName: "Amlodipine 5mg",
          dosage: "5mg",
          frequency: "Once daily",
          duration: "15 days",
          quantity: 15,
          instructions: "Take after breakfast",
        },
      ],
      reason: "Medication refill based on approved report " + targetReport.reportId,
    }),
  });

  const submitData = await submitRes.json();
  console.log("POST /api/medicine-requests status:", submitRes.status);
  console.log("Response body:", JSON.stringify(submitData, null, 2));

  if (submitRes.status !== 201 || !submitData.success) {
    throw new Error("Medicine request submission failed: " + JSON.stringify(submitData));
  }

  const createdRequest = submitData.data;
  console.log("✓ Successfully created medicine request:", createdRequest.requestId);
  console.log("  Saved patientId:", createdRequest.patientId);
  console.log("  Saved patient reference:", createdRequest.patient?._id, createdRequest.patient?.name);
  console.log("  Status:", createdRequest.status);

  // 5. Patient views their requests
  const patientRequestsRes = await fetch(`${API_BASE}/medicine-requests`, {
    headers: { Authorization: `Bearer ${patientToken}` },
  });
  const patientRequestsData = await patientRequestsRes.json();
  const myRequests = patientRequestsData.data || [];
  const foundInMyList = myRequests.find((r) => r.requestId === createdRequest.requestId);
  if (!foundInMyList) {
    throw new Error("Created request not found in patient's requests list!");
  }
  console.log("✓ Request found in patient's list with status:", foundInMyList.status);

  // 6. Admin Login
  const adminLoginRes = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@medcare.com", password: "Admin@123" }),
  });
  const adminLoginData = await adminLoginRes.json();
  const adminToken = adminLoginData.token;
  console.log("✓ Admin logged in:", adminLoginData.user.name);

  // 7. Admin views all medicine requests
  const adminRequestsRes = await fetch(`${API_BASE}/medicine-requests`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminRequestsData = await adminRequestsRes.json();
  const allRequests = adminRequestsData.data || [];
  const foundByAdmin = allRequests.find((r) => r.requestId === createdRequest.requestId);
  if (!foundByAdmin) {
    throw new Error("Created request not found in Admin's requests list!");
  }
  console.log("✓ Admin successfully sees request:", foundByAdmin.requestId);
  console.log("  Patient Name:", foundByAdmin.patient?.name);
  console.log("  Patient Reference ID:", foundByAdmin.patient?.patientId || foundByAdmin.patientId);
  console.log("  Patient Phone:", foundByAdmin.patient?.phone);

  // 8. Admin Approves Request
  const approveRes = await fetch(`${API_BASE}/medicine-requests/${createdRequest._id}/approve`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({}),
  });
  const approveData = await approveRes.json();
  console.log("PATCH /api/medicine-requests/:id/approve status:", approveRes.status);
  console.log("✓ Approved status:", approveData.data?.status);

  // 9. Patient verifies updated status
  const finalRequestsRes = await fetch(`${API_BASE}/medicine-requests`, {
    headers: { Authorization: `Bearer ${patientToken}` },
  });
  const finalData = await finalRequestsRes.json();
  const updatedReq = (finalData.data || []).find((r) => r.requestId === createdRequest.requestId);
  console.log("✓ Patient verifies updated status is:", updatedReq?.status);

  if (updatedReq?.status !== "approved") {
    throw new Error("Expected status to be approved, but got: " + updatedReq?.status);
  }

  console.log("\n>>> ALL MEDICINE REQUEST PATIENT REFERENCE TESTS PASSED! <<<");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
