import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpenText,
  Check,
  Hand,
  Mic,
  PanelLeft,
  SlidersHorizontal,
} from "lucide-react";
import { Link } from "react-router-dom";

import { AppShell } from "@/components/AppShell";
import { midi_to_note_name } from "@/features/audio/pitch";
import { useAudioPitchInput } from "@/features/audio/useAudioPitchInput";
import { use_app_settings_store } from "@/store/useAppSettingsStore";

export function Management() {
  const free_practice = use_app_settings_store((state) => state.free_practice);
  const sidebar_collapsed = use_app_settings_store((state) => state.sidebar_collapsed);
  const show_fingerings = use_app_settings_store((state) => state.show_fingerings);
  const set_free_practice = use_app_settings_store((state) => state.set_free_practice);
  const set_sidebar_collapsed = use_app_settings_store((state) => state.set_sidebar_collapsed);
  const set_show_fingerings = use_app_settings_store((state) => state.set_show_fingerings);
  const audio_input_enabled = use_app_settings_store((state) => state.audio_input_enabled);
  const audio_calibration_midi = use_app_settings_store((state) => state.audio_calibration_midi);
  const audio_calibration_frequency = use_app_settings_store((state) => state.audio_calibration_frequency);
  const audio_tuning_offset_cents = use_app_settings_store((state) => state.audio_tuning_offset_cents);
  const set_audio_input_enabled = use_app_settings_store((state) => state.set_audio_input_enabled);
  const set_audio_calibration_midi = use_app_settings_store((state) => state.set_audio_calibration_midi);
  const save_audio_calibration = use_app_settings_store((state) => state.save_audio_calibration);

  return (
    <AppShell>
      <section className="page-intro management-intro">
        <div>
          <p className="eyebrow"><SlidersHorizontal size={15} /> 学习管理</p>
          <h1>把学习路径<br />调成适合你的样子。</h1>
          <p className="intro-copy">
            这里控制访问方式和界面布局。课程完成记录不会因为切换开关而改变。
          </p>
        </div>
        <div className="management-summary">
          <Check size={18} />
          <div>
            <strong>{free_practice ? "自由学习已开启" : "按课程顺序学习"}</strong>
            <p>{free_practice ? "未学习任务也可以直接查看和练习。" : "仍可查看当前进度，后续任务按顺序开放。"}</p>
          </div>
        </div>
      </section>

      <section className="settings-layout" aria-label="学习设置">
        <article className="settings-section">
          <div className="settings-section-heading">
            <div>
              <p className="section-kicker"><BookOpenText size={15} /> 课程访问</p>
              <h2>学习权限</h2>
            </div>
            <span>默认开启</span>
          </div>
          <SettingToggle
            checked={free_practice}
            on_change={set_free_practice}
            title="允许查看并练习未学习任务"
            copy="打开课程路径中的任意周次和任务，不必等待前面的任务完成。完成记录仍按实际练习保存。"
          />
        </article>

        <article className="settings-section">
          <div className="settings-section-heading">
            <div>
              <p className="section-kicker"><PanelLeft size={15} /> 界面布局</p>
              <h2>左侧导航</h2>
            </div>
            <span>{sidebar_collapsed ? "当前收起" : "当前展开"}</span>
          </div>
          <SettingToggle
            checked={sidebar_collapsed}
            on_change={set_sidebar_collapsed}
            title="默认收起左侧导航"
            copy="收起后保留图标和当前页面提示，需要时点击导航顶部按钮即可恢复文字菜单。"
          />
        </article>

        <article className="settings-section">
          <div className="settings-section-heading">
            <div>
              <p className="section-kicker"><Hand size={15} /> 谱面辅助</p>
              <h2>逐音指法</h2>
            </div>
            <span>{show_fingerings ? "当前显示" : "当前隐藏"}</span>
          </div>
          <SettingToggle
            checked={show_fingerings}
            on_change={set_show_fingerings}
            title="默认显示谱面指法"
            copy="控制简谱圈号、五线谱数字和教材原谱注入指号。教学说明仍会保留。"
          />
        </article>

        <AudioInputSettings
          enabled={audio_input_enabled}
          calibration_midi={audio_calibration_midi}
          calibration_frequency={audio_calibration_frequency}
          tuning_offset_cents={audio_tuning_offset_cents}
          set_enabled={set_audio_input_enabled}
          set_calibration_midi={set_audio_calibration_midi}
          save_calibration={save_audio_calibration}
        />
      </section>

      <section className="management-next">
        <div>
          <p className="section-kicker">继续学习</p>
          <h2>设置完成后，回到课程路径选择任意任务。</h2>
        </div>
        <Link to="/课程" className="primary-button">
          查看课程路径 <ArrowRight size={17} />
        </Link>
      </section>
    </AppShell>
  );
}

function AudioInputSettings({
  enabled,
  calibration_midi,
  calibration_frequency,
  tuning_offset_cents,
  set_enabled,
  set_calibration_midi,
  save_calibration,
}: {
  enabled: boolean;
  calibration_midi: number;
  calibration_frequency?: number;
  tuning_offset_cents: number;
  set_enabled: (value: boolean) => void;
  set_calibration_midi: (value: number) => void;
  save_calibration: (value: {
    midi: number;
    frequency: number;
    tuning_offset_cents: number;
  }) => void;
}) {
  const [is_calibrating, set_is_calibrating] = useState(false);
  const {
    status: audio_status,
    current_pitch,
    connect,
    disconnect,
    begin_calibration,
  } = useAudioPitchInput(undefined, {
    on_calibration: (calibration) => {
      save_calibration(calibration);
      set_is_calibrating(false);
    },
  });

  useEffect(() => {
    if (!enabled) {
      disconnect();
      set_is_calibrating(false);
    }
  }, [disconnect, enabled]);

  const handle_connect = () => {
    if (audio_status === "connected") {
      disconnect();
      return;
    }
    void connect();
  };

  const handle_calibration = () => {
    set_enabled(true);
    set_is_calibrating(true);
    begin_calibration(calibration_midi);
    void connect();
  };

  return (
    <article className="settings-section audio-settings-section">
      <div className="settings-section-heading">
        <div>
          <p className="section-kicker"><Mic size={15} /> 声音输入</p>
          <h2>麦克风判定</h2>
        </div>
        <span>{enabled ? "可在练习中使用" : "当前关闭"}</span>
      </div>

      <SettingToggle
        checked={enabled}
        on_change={set_enabled}
        title="允许使用麦克风识别音高"
        copy="练习时读取麦克风中的单音，将声音转换为音符事件。建议使用电钢琴或靠近琴弦的麦克风。"
      />

      <div className="audio-calibration">
        <label>
          <span>校准目标音</span>
          <select
            value={calibration_midi}
            onChange={(event) => set_calibration_midi(Number(event.target.value))}
          >
            {audio_reference_notes.map((midi) => (
              <option key={midi} value={midi}>{midi_to_note_name(midi)}</option>
            ))}
          </select>
        </label>
        <div className="audio-calibration-actions">
          <button type="button" className="secondary-button" onClick={handle_connect}>
            <Mic size={16} />
            {audio_status === "connected" ? "断开麦克风" : "连接麦克风"}
          </button>
          <button type="button" className="primary-button" onClick={handle_calibration}>
            <Mic size={16} />
            {is_calibrating ? `请弹奏 ${midi_to_note_name(calibration_midi)}` : "录制校准音"}
          </button>
        </div>
        <p className="audio-calibration-status">
          {current_pitch
            ? `当前检测：${current_pitch.note_name} · ${current_pitch.frequency.toFixed(1)} Hz`
            : get_audio_status_copy(audio_status)}
        </p>
        {calibration_frequency && (
          <p className="audio-calibration-result">
            已校准 {midi_to_note_name(calibration_midi)}：{calibration_frequency.toFixed(1)} Hz
            {" · "}修正 {format_cents(tuning_offset_cents)}
          </p>
        )}
      </div>
    </article>
  );
}

const audio_reference_notes = [48, 52, 55, 57, 60, 64, 67, 69, 72];

function get_audio_status_copy(status: ReturnType<typeof useAudioPitchInput>["status"]): string {
  if (status === "requesting") {
    return "正在请求麦克风权限…";
  }
  if (status === "connected") {
    return "已连接，请弹奏一个单音观察检测结果。";
  }
  if (status === "insecure") {
    return "当前访问地址不是安全上下文，浏览器不会开放麦克风。请在本机用 localhost，或用 HTTPS 局域网地址。";
  }
  if (status === "unavailable") {
    return "当前浏览器未开放麦克风音频输入接口。";
  }
  if (status === "denied") {
    return "麦克风权限未授予，请在浏览器设置中允许访问。";
  }
  return "先连接麦克风，再录制中央 C 或其他校准音。";
}

function format_cents(cents: number): string {
  return `${cents >= 0 ? "+" : ""}${cents.toFixed(1)} cents`;
}

function SettingToggle({
  checked,
  on_change,
  title,
  copy,
}: {
  checked: boolean;
  on_change: (value: boolean) => void;
  title: string;
  copy: string;
}) {
  return (
    <label className="setting-toggle">
      <span className="setting-toggle-copy">
        <strong>{title}</strong>
        <small>{copy}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => on_change(event.target.checked)}
      />
      <span className="setting-toggle-track" aria-hidden="true">
        <span />
      </span>
    </label>
  );
}
