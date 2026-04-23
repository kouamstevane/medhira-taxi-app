import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/config/firebase-admin';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false }, { status: 401 });
    }

    if (!adminAuth || !adminDb) {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
    }

    const token = authHeader.slice(7);
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    const adminDoc = await adminDb.collection('admins').doc(uid).get();
    if (!adminDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    console.error('\x1b[31m%s\x1b[0m', '--- CLIENT ERROR LOG ---');
    console.error('Message:', body.message);
    console.error('Code:', body.code);
    if (body.stack) console.error('Stack:', body.stack);
    if (body.context) console.error('Context:', body.context);
    console.error('\x1b[31m%s\x1b[0m', '------------------------');
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
