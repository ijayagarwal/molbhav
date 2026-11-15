"use client";

// Phosphor icons, Bold weight (DESIGN §8), re-exported in one place so components stay consistent.
import {
  ArrowCounterClockwise,
  ArrowDown,
  Clock,
  Handshake,
  Hourglass,
  PhoneDisconnect,
  SealCheck,
  Star,
  Waveform,
  XCircle,
  CaretDown,
  CaretLeft,
  CaretRight,
  Check,
  Desktop,
  DeviceMobile,
  Gear,
  Keyboard,
  LockSimple,
  MapPin,
  Microphone,
  PaperPlaneRight,
  Pause,
  Phone,
  Play,
  Plus,
  Receipt,
  SpeakerHigh,
  SpeakerSlash,
  Stop,
  Storefront,
  Warning,
  X,
} from "@phosphor-icons/react";
import type { ComponentProps } from "react";

type IconProps = Omit<ComponentProps<typeof Phone>, "weight">;

export const PhoneBold = (p: IconProps) => <Phone weight="bold" aria-hidden="true" {...p} />;
export const CheckBold = (p: IconProps) => <Check weight="bold" aria-hidden="true" {...p} />;
export const XBold = (p: IconProps) => <X weight="bold" aria-hidden="true" {...p} />;
export const PlayBold = (p: IconProps) => <Play weight="fill" aria-hidden="true" {...p} />;
export const PauseBold = (p: IconProps) => <Pause weight="fill" aria-hidden="true" {...p} />;
export const ReplayBold = (p: IconProps) => <ArrowCounterClockwise weight="bold" aria-hidden="true" {...p} />;
export const SoundOnBold = (p: IconProps) => <SpeakerHigh weight="bold" aria-hidden="true" {...p} />;
export const SoundOffBold = (p: IconProps) => <SpeakerSlash weight="bold" aria-hidden="true" {...p} />;
export const PhoneLayoutBold = (p: IconProps) => <DeviceMobile weight="bold" aria-hidden="true" {...p} />;
export const DeskLayoutBold = (p: IconProps) => <Desktop weight="bold" aria-hidden="true" {...p} />;
export const MicBold = (p: IconProps) => <Microphone weight="bold" aria-hidden="true" {...p} />;
export const LockBold = (p: IconProps) => <LockSimple weight="bold" aria-hidden="true" {...p} />;
export const BackBold = (p: IconProps) => <CaretLeft weight="bold" aria-hidden="true" {...p} />;
export const NextBold = (p: IconProps) => <CaretRight weight="bold" aria-hidden="true" {...p} />;
export const DownBold = (p: IconProps) => <CaretDown weight="bold" aria-hidden="true" {...p} />;
export const PinBold = (p: IconProps) => <MapPin weight="bold" aria-hidden="true" {...p} />;
export const KeyboardBold = (p: IconProps) => <Keyboard weight="bold" aria-hidden="true" {...p} />;
export const PlusBold = (p: IconProps) => <Plus weight="bold" aria-hidden="true" {...p} />;
export const OrdersBold = (p: IconProps) => <Receipt weight="bold" aria-hidden="true" {...p} />;
export const DealersBold = (p: IconProps) => <Storefront weight="bold" aria-hidden="true" {...p} />;
export const SettingsBold = (p: IconProps) => <Gear weight="bold" aria-hidden="true" {...p} />;
export const SendBold = (p: IconProps) => <PaperPlaneRight weight="bold" aria-hidden="true" {...p} />;
export const StopBold = (p: IconProps) => <Stop weight="fill" aria-hidden="true" {...p} />;
export const WarningBold = (p: IconProps) => <Warning weight="bold" aria-hidden="true" {...p} />;
export const DropBold = (p: IconProps) => <ArrowDown weight="bold" aria-hidden="true" {...p} />;
export const ClockBold = (p: IconProps) => <Clock weight="bold" aria-hidden="true" {...p} />;
export const MatchBold = (p: IconProps) => <Handshake weight="bold" aria-hidden="true" {...p} />;
export const QueueBold = (p: IconProps) => <Hourglass weight="bold" aria-hidden="true" {...p} />;
export const BusyBold = (p: IconProps) => <PhoneDisconnect weight="bold" aria-hidden="true" {...p} />;
export const FinalBold = (p: IconProps) => <SealCheck weight="bold" aria-hidden="true" {...p} />;
export const BestBold = (p: IconProps) => <Star weight="fill" aria-hidden="true" {...p} />;
export const WaveformBold = (p: IconProps) => <Waveform weight="bold" aria-hidden="true" {...p} />;
export const DeclinedBold = (p: IconProps) => <XCircle weight="bold" aria-hidden="true" {...p} />;
