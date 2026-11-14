"use client";

// Phosphor icons, Bold weight (DESIGN §8), re-exported in one place so components stay consistent.
import { ArrowCounterClockwise, Check, Desktop, DeviceMobile, Phone, Play, SpeakerHigh, SpeakerSlash, X } from "@phosphor-icons/react";
import type { ComponentProps } from "react";

type IconProps = Omit<ComponentProps<typeof Phone>, "weight">;

export const PhoneBold = (p: IconProps) => <Phone weight="bold" aria-hidden="true" {...p} />;
export const CheckBold = (p: IconProps) => <Check weight="bold" aria-hidden="true" {...p} />;
export const XBold = (p: IconProps) => <X weight="bold" aria-hidden="true" {...p} />;
export const PlayBold = (p: IconProps) => <Play weight="fill" aria-hidden="true" {...p} />;
export const ReplayBold = (p: IconProps) => <ArrowCounterClockwise weight="bold" aria-hidden="true" {...p} />;
export const SoundOnBold = (p: IconProps) => <SpeakerHigh weight="bold" aria-hidden="true" {...p} />;
export const SoundOffBold = (p: IconProps) => <SpeakerSlash weight="bold" aria-hidden="true" {...p} />;
export const PhoneLayoutBold = (p: IconProps) => <DeviceMobile weight="bold" aria-hidden="true" {...p} />;
export const DeskLayoutBold = (p: IconProps) => <Desktop weight="bold" aria-hidden="true" {...p} />;
