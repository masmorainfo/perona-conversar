import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const stateFile = 'C:/AI/perona - conversar/tour_state.json';



export async function GET() {
  try {
    if (fs.existsSync(stateFile)) {
      const data = fs.readFileSync(stateFile, 'utf8');
      return NextResponse.json(JSON.parse(data));
    }
    return NextResponse.json({ step: 0, title: '', content: '', debug_path: stateFile, debug_cwd: process.cwd() });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to read tour state' }, { status: 500 });
  }
}

export async function POST() {
  try {
    if (fs.existsSync(stateFile)) {
      const data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      data.step += 1;
      // We don't change title/content here, the agent background script will do it when it detects the step increment.
      fs.writeFileSync(stateFile, JSON.stringify(data, null, 2), 'utf8');
      return NextResponse.json(data);
    }
    return NextResponse.json({ error: 'State file not found' }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update tour state' }, { status: 500 });
  }
}
