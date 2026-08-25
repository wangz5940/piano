import { useCallback, useEffect, useRef, useState } from "react";

import type { normalized_note_event } from "@/features/course/types";

type midi_status = "idle" | "requesting" | "connected" | "unavailable" | "denied";

interface midi_device {
  id: string;
  name: string;
}

export function useMidiInput(on_note: (event: normalized_note_event) => void) {
  const on_note_ref = useRef(on_note);
  const access_ref = useRef<MIDIAccess | null>(null);
  const active_input_ref = useRef<MIDIInput | null>(null);
  const [status, set_status] = useState<midi_status>("idle");
  const [devices, set_devices] = useState<midi_device[]>([]);
  const [active_device_id, set_active_device_id] = useState<string | undefined>();

  useEffect(() => {
    on_note_ref.current = on_note;
  }, [on_note]);

  const detach_input = useCallback(() => {
    if (active_input_ref.current) {
      active_input_ref.current.onmidimessage = null;
      active_input_ref.current = null;
    }
  }, []);

  const attach_input = useCallback(
    (input: MIDIInput) => {
      detach_input();
      input.onmidimessage = (event) => {
        const data = event.data;
        if (!data || data.length < 3) {
          return;
        }

        const status_byte = data[0];
        const note = data[1];
        const velocity = data[2];
        const command = status_byte & 0xf0;
        const is_note_on = command === 0x90 && velocity > 0;
        const is_note_off = command === 0x80 || (command === 0x90 && velocity === 0);

        if (is_note_on || is_note_off) {
          on_note_ref.current({
            type: is_note_on ? "note_on" : "note_off",
            note,
            velocity,
            timestamp: performance.now(),
            source: "midi",
          });
        }
      };
      active_input_ref.current = input;
      set_active_device_id(input.id);
    },
    [detach_input],
  );

  const refresh_devices = useCallback(
    (access: MIDIAccess, preferred_id?: string) => {
      const inputs = Array.from(access.inputs.values());
      const next_devices = inputs.map((input) => ({
        id: input.id,
        name: input.name ?? "未命名 MIDI 设备",
      }));
      set_devices(next_devices);

      const next_input = inputs.find((input) => input.id === preferred_id) ?? inputs[0];
      if (next_input) {
        attach_input(next_input);
        set_status("connected");
      } else {
        detach_input();
        set_active_device_id(undefined);
        set_status("idle");
      }
    },
    [attach_input, detach_input],
  );

  const connect = useCallback(async () => {
    const request_midi_access = (
      navigator as Navigator & {
        requestMIDIAccess?: (options?: MIDIOptions) => Promise<MIDIAccess>;
      }
    ).requestMIDIAccess;
    if (!request_midi_access) {
      set_status("unavailable");
      return;
    }

    set_status("requesting");
    try {
      const access = await request_midi_access.call(navigator);
      access_ref.current = access;
      refresh_devices(access);
      access.onstatechange = () => refresh_devices(access, active_input_ref.current?.id);
    } catch {
      set_status("denied");
    }
  }, [refresh_devices]);

  const select_device = useCallback(
    (device_id: string) => {
      const input = access_ref.current?.inputs.get(device_id);
      if (input) {
        attach_input(input);
        set_status("connected");
      }
    },
    [attach_input],
  );

  useEffect(
    () => () => {
      detach_input();
      if (access_ref.current) {
        access_ref.current.onstatechange = null;
      }
    },
    [detach_input],
  );

  return {
    status,
    devices,
    active_device_id,
    connect,
    select_device,
  };
}
