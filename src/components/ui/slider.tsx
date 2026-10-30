import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";
import { readSliderColor } from "@/lib/sliderColor";

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, style, ...props }, ref) => {
  const sliderColor = readSliderColor(style);
  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn(
        "relative flex w-full touch-none select-none items-center",
        className,
      )}
      style={style}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
        <SliderPrimitive.Range
          className="absolute h-full bg-primary transition-colors duration-200"
          style={sliderColor ? { backgroundColor: sliderColor } : undefined}
        />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        style={sliderColor ? { borderColor: sliderColor } : undefined}
      />
    </SliderPrimitive.Root>
  );
});
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
