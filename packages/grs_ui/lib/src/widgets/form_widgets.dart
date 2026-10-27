import 'package:flutter/material.dart';

/// Catalog and components for Form Widgets traced in docs/traceability.csv.
/// Includes: DropdownSelect, TextInput, PhoneInput, EmailInput, ReadOnlyBadge,
/// TextArea, Checkbox, NumberInput, RadioGroup, LookupSelect, MultiSelectChip, ConsentCheckbox.

enum GrsFormWidgetType {
  dropdownSelect,
  textInput,
  phoneInput,
  emailInput,
  readOnlyBadge,
  textArea,
  checkbox,
  numberInput,
  radioGroup,
  lookupSelect,
  multiSelectChip,
  consentCheckbox,
}

class GrsFormWidgetsRegistry {
  static const Set<String> supportedWidgets = {
    'DropdownSelect',
    'TextInput',
    'PhoneInput',
    'EmailInput',
    'ReadOnlyBadge',
    'TextArea',
    'Checkbox',
    'NumberInput',
    'RadioGroup',
    'LookupSelect',
    'MultiSelectChip',
    'ConsentCheckbox',
  };

  static bool hasWidget(String widgetName) =>
      supportedWidgets.contains(widgetName);
}

/// A read-only badge widget for serial numbers or locked fields.
class GrsReadOnlyBadge extends StatelessWidget {
  final String label;
  final String value;

  const GrsReadOnlyBadge({super.key, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.grey.shade200,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }
}

/// Consent checkbox widget ensuring user explicitly confirms data collection.
class GrsConsentCheckbox extends StatelessWidget {
  final bool value;
  final String text;
  final ValueChanged<bool?> onChanged;

  const GrsConsentCheckbox({
    super.key,
    required this.value,
    required this.text,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return CheckboxListTile(
      value: value,
      onChanged: onChanged,
      title: Text(text),
      controlAffinity: ListTileControlAffinity.leading,
    );
  }
}
