import { NextResponse } from "next/server";
import { getMusicSettings, saveMusicSettings } from "@/lib/music/service";
import { isMusicSource } from "@/lib/music/settings";
import type { MusicSourceSettings } from "@/lib/music/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MusicSettingsPayload = Partial<MusicSourceSettings>;

export async function GET() {
  return NextResponse.json({ ok: true, settings: await getMusicSettings() });
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as MusicSettingsPayload;
  const current = await getMusicSettings();
  const patch: Partial<MusicSourceSettings> = {};

  if ("defaultSource" in payload) {
    if (!isMusicSource(payload.defaultSource)) {
      return NextResponse.json({ ok: false, error: "invalid_music_source" }, { status: 400 });
    }
    patch.defaultSource = payload.defaultSource;
  }

  if (payload.somafm) patch.somafm = { ...current.somafm, ...payload.somafm };
  if (payload.library) patch.library = { ...current.library, ...payload.library };
  if (payload.aceStep) patch.aceStep = { ...current.aceStep, ...payload.aceStep };

  const settings = await saveMusicSettings(patch);
  return NextResponse.json({ ok: true, settings });
}
