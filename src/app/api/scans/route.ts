import { NextRequest, NextResponse } from "next/server";
import { initializeAdmin } from "@/lib/firebase/firebaseAdmin";
import { CreateScanRequest } from "@/lib/types/scanner";

export async function POST(request: NextRequest) {
  try {
    const admin = initializeAdmin();
    const auth = admin.auth();
    const firestore = admin.firestore();
    
    // Get the authorization token
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Unauthorized - No token provided" },
        { status: 401 }
      );
    }

    const token = authHeader.split("Bearer ")[1];
    
    // Verify the user token
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (error) {
      return NextResponse.json(
        { error: "Unauthorized - Invalid token" },
        { status: 401 }
      );
    }

    const userId = decodedToken.uid;

    // Parse the request body
    const body: CreateScanRequest = await request.json();
    const { type, target, options } = body;

    // Validate input
    if (!type || !target || !options) {
      return NextResponse.json(
        { error: "Missing required fields: type, target, options" },
        { status: 400 }
      );
    }

    // Validate scan type
    if (type !== "nmap" && type !== "openvas") {
      return NextResponse.json(
        { error: "Invalid scan type. Must be 'nmap' or 'openvas'" },
        { status: 400 }
      );
    }

    // Basic target validation (IP or domain)
    const targetPattern = /^(?:(?:\d{1,3}\.){3}\d{1,3}|[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)$/;
    if (!targetPattern.test(target)) {
      return NextResponse.json(
        { error: "Invalid target format. Must be a valid IP address or domain" },
        { status: 400 }
      );
    }

    // Check user's subscription status (optional - implement based on your needs)
    // const userDoc = await firestore.collection("users").doc(userId).get();
    // if (!userDoc.exists || !userDoc.data()?.subscriptionStatus === "active") {
    //   return NextResponse.json(
    //     { error: "Active subscription required" },
    //     { status: 403 }
    //   );
    // }

    // Create scan document
    const scanData = {
      userId,
      type,
      target,
      options,
      status: "queued",
      createdAt: new Date(),
    };

    const scanRef = await firestore.collection("scans").add(scanData);

    // Add to scan queue
    await firestore.collection("scanQueue").add({
      scanId: scanRef.id,
      priority: 1,
      queuedAt: new Date(),
    });

    return NextResponse.json(
      {
        success: true,
        scanId: scanRef.id,
        message: "Scan queued successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating scan:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const admin = initializeAdmin();
    const auth = admin.auth();
    const firestore = admin.firestore();
    
    // Get the authorization token
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Unauthorized - No token provided" },
        { status: 401 }
      );
    }

    const token = authHeader.split("Bearer ")[1];
    
    // Verify the user token
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (error) {
      return NextResponse.json(
        { error: "Unauthorized - Invalid token" },
        { status: 401 }
      );
    }

    const userId = decodedToken.uid;

    // Get user's scans
    const scansSnapshot = await firestore
      .collection("scans")
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const scans = scansSnapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({
      success: true,
      scans,
    });
  } catch (error) {
    console.error("Error fetching scans:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
