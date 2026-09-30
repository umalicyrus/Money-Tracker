<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class SyncOperationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'operation_id' => ['required', 'uuid'],
            'device_id' => ['required', 'uuid'],
            'entity_type' => ['required', 'string', 'in:wallets,categories,transactions,budgets'],
            'entity_id' => ['required', 'uuid'],
            'action' => ['required', 'string', 'in:create,update,archive'],
            'base_version' => ['required', 'regex:/^(0|[1-9][0-9]*)$/'],
            'payload' => ['required', 'array:name,description,type,opening_date,opening_balance_minor,currency,icon,icon_image,wallet_id,destination_wallet_id,category_id,amount_minor,transaction_date,note,items,month_start,limit_minor'],
            'payload.name' => [Rule::requiredIf(fn (): bool => in_array($this->input('entity_type'), ['wallets', 'categories'], true)), 'string', 'min:1', 'max:60', 'regex:/\S/'],
            'payload.description' => ['sometimes', 'nullable', 'string', 'max:160'],
            'payload.type' => [Rule::requiredIf(fn (): bool => in_array($this->input('entity_type'), ['wallets', 'categories', 'transactions'], true)), 'string', Rule::in(['cash', 'bank', 'ewallet', 'income', 'expense', 'transfer'])],
            'payload.opening_date' => [Rule::requiredIf(fn (): bool => $this->input('entity_type') === 'wallets'), 'date_format:Y-m-d', 'before_or_equal:today'],
            'payload.opening_balance_minor' => [
                'sometimes',
                'string',
                'regex:/^-?(0|[1-9][0-9]*)$/',
                'regex:/^-?(?:0|[1-9][0-9]{0,11})$/',
            ],
            'payload.currency' => ['sometimes', 'string', 'size:3', 'in:PHP'],
            'payload.icon' => ['sometimes', 'string', Rule::in(['tag', 'food', 'home', 'car', 'gift', 'health', 'groceries', 'shopping', 'coffee', 'transport', 'phone', 'utilities', 'bills', 'education', 'travel', 'entertainment', 'clothing', 'beauty', 'pets', 'family', 'salary', 'business', 'freelance', 'investments', 'savings', 'bonus', 'cash', 'bank', 'card', 'insurance', 'tax', 'charity', 'fitness', 'music', 'games', 'book', 'other', 'wallet'])],
            'payload.icon_image' => ['sometimes', 'nullable', 'string', 'max:70000', 'regex:/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/]+=*$/'],
            'payload.wallet_id' => [Rule::requiredIf(fn (): bool => $this->input('entity_type') === 'transactions'), 'uuid'],
            'payload.destination_wallet_id' => [Rule::requiredIf(fn (): bool => $this->input('entity_type') === 'transactions' && $this->input('payload.type') === 'transfer'), 'nullable', 'uuid'],
            'payload.category_id' => [Rule::requiredIf(fn (): bool => $this->input('entity_type') === 'transactions' && $this->input('payload.type') !== 'transfer'), 'nullable', 'uuid'],
            'payload.amount_minor' => [Rule::requiredIf(fn (): bool => $this->input('entity_type') === 'transactions'), 'string', 'regex:/^[1-9][0-9]{0,11}$/'],
            'payload.transaction_date' => [Rule::requiredIf(fn (): bool => $this->input('entity_type') === 'transactions'), 'date_format:Y-m-d', 'before_or_equal:today'],
            'payload.note' => ['sometimes', 'nullable', 'string', 'max:500'],
            'payload.items' => ['sometimes', 'array', 'min:1', 'max:50'],
            'payload.items.*.name' => ['required_with:payload.items', 'string', 'max:100', 'regex:/\S/'],
            'payload.items.*.quantity' => ['required_with:payload.items', 'integer', 'min:1', 'max:9999'],
            'payload.items.*.unit_price_minor' => ['required_with:payload.items', 'string', 'regex:/^[1-9][0-9]{0,11}$/'],
            'payload.month_start' => [Rule::requiredIf(fn (): bool => $this->input('entity_type') === 'budgets'), 'date_format:Y-m-d', 'regex:/^\d{4}-\d{2}-01$/'],
            'payload.limit_minor' => [Rule::requiredIf(fn (): bool => $this->input('entity_type') === 'budgets'), 'string', 'regex:/^[1-9][0-9]{0,11}$/'],
        ];
    }
}
