import {
  defaultInstallmentFormValues,
  installmentFormSchema,
  installmentToFormValues,
  previewPlan,
  toInstallmentInput,
  type InstallmentFormValues,
} from '@/features/installments/installment-form-schema';

const values = (overrides: Partial<InstallmentFormValues> = {}): InstallmentFormValues => ({
  ...defaultInstallmentFormValues('2026-09-15'),
  description: 'Laptop',
  principal: '1200',
  months: '12',
  ...overrides,
});

const errorsFor = (v: InstallmentFormValues) => {
  const result = installmentFormSchema('en-CA').safeParse(v);
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((i) => [i.path[0], i.message]));
};

describe('installment form', () => {
  it('accepts a plan and splits it evenly when no monthly amount is given', () => {
    expect(errorsFor(values())).toEqual({});
    expect(toInstallmentInput(values(), 'visa', 'en-CA')).toEqual({
      accountId: 'visa',
      description: 'Laptop',
      principalCents: 120000,
      months: 12,
      monthlyCents: 10000,
      monthlyFeeCents: 0,
      firstPaymentDate: '2026-09-15',
      notes: null,
    });
  });

  it('keeps a typed monthly amount and fee', () => {
    expect(
      toInstallmentInput(values({ monthly: '105', monthlyFee: '2.50' }), 'visa', 'en-CA'),
    ).toMatchObject({ monthlyCents: 10500, monthlyFeeCents: 250 });
  });

  it('explains what is wrong', () => {
    expect(errorsFor(values({ description: '', principal: '0', months: '0' }))).toEqual({
      description: 'installmentForm.errors.descriptionRequired',
      principal: 'installmentForm.errors.amount',
      months: 'installmentForm.errors.months',
    });
    // 12 × $50 never pays off $1,200.
    expect(errorsFor(values({ monthly: '50' }))).toEqual({
      monthly: 'installmentForm.errors.tooSmall',
    });
  });

  it('previews only once the plan is complete, and round-trips', () => {
    expect(previewPlan(values({ principal: '' }), 'en-CA')).toBeNull();
    const plan = {
      id: 'p',
      createdAt: '',
      updatedAt: '',
      ...toInstallmentInput(values(), 'visa', 'en-CA'),
      monthlyFeeCents: 0,
      notes: null,
    };
    expect(installmentToFormValues(plan, 'en-CA')).toMatchObject({
      principal: '1200.00',
      months: '12',
      monthly: '',
    });
  });
});
