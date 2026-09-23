import * as React from 'react';
import { Input as InputPrimitive } from '@base-ui/react/input';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const inputVariants = cva(
  'w-full min-w-0 outline-none transition-colors placeholder:font-normal placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-search-cancel-button]:hidden',
  {
    variants: {
      variant: {
        default:
          'h-9 rounded-4xl border border-input bg-input/30 px-3 py-1 text-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        bare: 'pagesift-input',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Input({
  className,
  type,
  variant = 'default',
  ...props
}: React.ComponentProps<'input'> & VariantProps<typeof inputVariants>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(inputVariants({ variant, className }))}
      {...props}
    />
  );
}

export { Input, inputVariants };
