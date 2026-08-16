import React, { createContext, useContext } from "react";
import { useSearchParams } from "react-router-dom";

import { useTheme } from "@/components/theme-provider";

interface EmbedColorsContextType {
  backgroundColor: string;
  textForegroundColor: string;
  primaryColor: string;
  fromMeBubbleColor: string;
  fromMeForegroundColor: string;
  fromOtherBubbleColor: string;
  fromOtherForegroundColor: string;
  fromMeQuotedBubbleColor: string;
  fromOtherQuotedBubbleColor: string;
  inputBackgroundColor: string;
  inputTextForegroundColor: string;
  inputIconsMainColor: string;
}

const EmbedColorsContext = createContext<EmbedColorsContextType>({
  backgroundColor: "",
  textForegroundColor: "",
  primaryColor: "",
  fromMeBubbleColor: "",
  fromMeForegroundColor: "",
  fromOtherBubbleColor: "",
  fromOtherForegroundColor: "",
  fromMeQuotedBubbleColor: "",
  fromOtherQuotedBubbleColor: "",
  inputBackgroundColor: "",
  inputTextForegroundColor: "",
  inputIconsMainColor: "",
});

export function EmbedColorsProvider({ children }: { children: React.ReactNode }) {
  const [searchParams] = useSearchParams();
  const { resolvedTheme } = useTheme();
  const backgroundColor = searchParams.get("backgroundColor");
  const textForegroundColor = searchParams.get("textForegroundColor");
  const primaryColor = searchParams.get("primaryColor");
  const fromMeBubbleColor = searchParams.get("fromMeBubbleColor");
  const fromMeForegroundColor = searchParams.get("fromMeForegroundColor");
  const fromOtherBubbleColor = searchParams.get("fromOtherBubbleColor");
  const fromOtherForegroundColor = searchParams.get("fromOtherForegroundColor");
  const fromMeQuotedBubbleColor = searchParams.get("fromMeQuotedBubbleColor");
  const fromOtherQuotedBubbleColor = searchParams.get("fromOtherQuotedBubbleColor");
  const inputBackgroundColor = searchParams.get("inputBackgroundColor");
  const inputTextForegroundColor = searchParams.get("inputTextForegroundColor");
  const inputIconsMainColor = searchParams.get("inputIconsMainColor");
  const getDefaultBackgroundColor = () => {
    if (resolvedTheme === "dark") {
      return "#0f0f0f";
    }
    return "#faf9fa";
  };

  const getDefaultTextForegroundColor = () => {
    if (resolvedTheme === "dark") {
      return "#faf9fa";
    }
    return "#020202";
  };

  const getDefaultPrimaryColor = () => {
    if (resolvedTheme === "dark") {
      return "#0b332a";
    }
    return "#e0f0f0";
  };

  const getDefaultFromMeBubbleColor = () => {
    if (resolvedTheme === "dark") {
      return "#0b332a";
    }
    return "#c8fff2";
  };

  const getDefaultFromMeForegroundColor = () => {
    if (resolvedTheme === "dark") {
      return "#ffffff";
    }
    return "#020202";
  };

  const getDefaultFromOtherBubbleColor = () => {
    if (resolvedTheme === "dark") {
      return "#1d2724";
    }
    return "#e0f0f0";
  };

  const getDefaultFromOtherForegroundColor = () => {
    if (resolvedTheme === "dark") {
      return "#ffffff";
    }
    return "#020202";
  };

  const getDefaultInputBackgroundColor = () => {
    if (resolvedTheme === "dark") {
      return "#161616";
    }
    return "#e0f0f0";
  };

  const getDefaultInputTextForegroundColor = () => {
    if (resolvedTheme === "dark") {
      return "#faf9fa";
    }
    return "#020202";
  };

  const getDefaultFromMeQuotedBubbleColor = () => {
    if (resolvedTheme === "dark") {
      return "#1f463d";
    }
    return "#aff7e6";
  };

  const getDefaultFromOtherQuotedBubbleColor = () => {
    if (resolvedTheme === "dark") {
      return "#0f1413";
    }
    return "#d2e2e2";
  };

  const getDefaultInputIconsMainColor = () => {
    if (resolvedTheme === "dark") {
      return "#0e6451";
    }
    return "#0b332a";
  };

  return (
    <EmbedColorsContext.Provider
      value={{
        backgroundColor: backgroundColor || getDefaultBackgroundColor(),
        textForegroundColor: textForegroundColor || getDefaultTextForegroundColor(),
        primaryColor: primaryColor || getDefaultPrimaryColor(),
        fromMeBubbleColor: fromMeBubbleColor || getDefaultFromMeBubbleColor(),
        fromMeForegroundColor: fromMeForegroundColor || getDefaultFromMeForegroundColor(),
        fromOtherBubbleColor: fromOtherBubbleColor || getDefaultFromOtherBubbleColor(),
        fromOtherForegroundColor: fromOtherForegroundColor || getDefaultFromOtherForegroundColor(),
        fromMeQuotedBubbleColor: fromMeQuotedBubbleColor || getDefaultFromMeQuotedBubbleColor(),
        fromOtherQuotedBubbleColor: fromOtherQuotedBubbleColor || getDefaultFromOtherQuotedBubbleColor(),
        inputBackgroundColor: inputBackgroundColor || getDefaultInputBackgroundColor(),
        inputTextForegroundColor: inputTextForegroundColor || getDefaultInputTextForegroundColor(),
        inputIconsMainColor: inputIconsMainColor || getDefaultInputIconsMainColor(),
      }}>
      {children}
    </EmbedColorsContext.Provider>
  );
}

export const useEmbedColors = () => useContext(EmbedColorsContext);
