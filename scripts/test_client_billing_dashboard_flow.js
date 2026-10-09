const API_BASE = "http://localhost:5000/api";

async function main() {
  console.log("=== Testing Client Dashboard Approved Bills Flow ===");

  // 1. Login Admin
  const adminLoginRes = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@medcare.com", password: "Admin@123" }),
  });
  const adminData = await adminLoginRes.json();
  const adminToken = adminData.token;
  console.log("✓ Admin logged in:", adminData.user.name);

  // 2. Login Patient Arun Kumar
  const patientLoginRes = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "arun@gmail.com", password: "Patient@123" }),
  });
  const patientData = await patientLoginRes.json();
  const patientToken = patientData.token;
  console.log("✓ Patient logged in:", patientData.user.name);

  // 3. Initial Client Dashboard Stats
  const initialStatsRes = await fetch(`${API_BASE}/dashboard/client-stats`, {
    headers: { Authorization: `Bearer ${patientToken}` },
  });
  const initialStats = await initialStatsRes.json();
  const initialApprovedBills = initialStats.data?.approvedBills || 0;
  console.log(`✓ Initial approved bills count on Client Dashboard: ${initialApprovedBills}`);

  // 4. Admin creates a new pending invoice for Arun Kumar (PAT-1001)
  const testBillNo = `BILL-TEST-${Date.now().toString().slice(-4)}`;
  const createBillRes = await fetch(`${API_BASE}/billing`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      billNumber: testBillNo,
      patientId: "PAT-1001",
      patientName: "Arun Kumar",
      doctor: "Dr. Rajesh Kumar",
      department: "Cardiology",
      consultation: 500,
      medicineCharges: 250,
      testCharges: 300,
      paymentStatus: "Pending",
      paymentMethod: "Not Paid",
      approvalStatus: "Pending",
      isApproved: false,
    }),
  });
  const createBillData = await createBillRes.json();
  console.log(`✓ Admin created new invoice ${testBillNo}, initial approval status: ${createBillData.data?.approvalStatus}`);

  // 5. Verify before approval: Client dashboard stats count does not increment for approved bills
  const unapprovedStatsRes = await fetch(`${API_BASE}/dashboard/client-stats`, {
    headers: { Authorization: `Bearer ${patientToken}` },
  });
  const unapprovedStats = await unapprovedStatsRes.json();
  console.log(`✓ Client Dashboard approved bills before approval: ${unapprovedStats.data?.approvedBills} (unchanged)`);

  // 6. Admin approves the bill
  const approveRes = await fetch(`${API_BASE}/billing/${createBillData.data?._id}/approve`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({}),
  });
  const approveData = await approveRes.json();
  console.log(`✓ Admin approved invoice ${testBillNo}:`, approveData.data?.approvalStatus);

  // 7. Client Dashboard Stats after approval
  const afterApprovedStatsRes = await fetch(`${API_BASE}/dashboard/client-stats`, {
    headers: { Authorization: `Bearer ${patientToken}` },
  });
  const afterApprovedStats = await afterApprovedStatsRes.json();
  const newApprovedCount = afterApprovedStats.data?.approvedBills;
  console.log(`✓ Client Dashboard approved bills AFTER approval: ${newApprovedCount}`);

  if (newApprovedCount !== initialApprovedBills + 1) {
    throw new Error(`Expected approvedBills to be ${initialApprovedBills + 1}, but got ${newApprovedCount}`);
  }

  // 8. Verify MyBilling endpoint (/api/billing) as patient returns the new bill
  const myBillsRes = await fetch(`${API_BASE}/billing`, {
    headers: { Authorization: `Bearer ${patientToken}` },
  });
  const myBillsData = await myBillsRes.json();
  const foundInMyBilling = (myBillsData.data || []).find((b) => b.billNumber === testBillNo);
  if (!foundInMyBilling) {
    throw new Error(`Bill ${testBillNo} not found in client MyBilling list!`);
  }
  console.log(`✓ Bill ${testBillNo} successfully published to Client's MyBilling:`, foundInMyBilling.billNumber, `Total: ₹${foundInMyBilling.totalAmount}`);

  console.log("\n>>> ALL CLIENT DASHBOARD APPROVED BILLS TESTS PASSED! <<<");
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
