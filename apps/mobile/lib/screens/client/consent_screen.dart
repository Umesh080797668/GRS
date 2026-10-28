import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:grs_core/grs_core.dart';
import 'package:grs_ui/grs_ui.dart';
import '../../l10n/l10n.dart';

class ConsentScreen extends StatefulWidget {
  final String houseId;

  const ConsentScreen({super.key, required this.houseId});

  @override
  State<ConsentScreen> createState() => _ConsentScreenState();
}

class _ConsentScreenState extends State<ConsentScreen> {
  bool _consentChecked = false;

  @override
  Widget build(BuildContext context) {
    final l10n = GrsL10n.of(context);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.get('consentTitle'))),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(
                  Icons.privacy_tip_outlined,
                  color: GrsColors.primaryLight,
                  size: 36,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        l10n.get('consentTitle'),
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 2),
                      const Text(
                        'Version: ${DdCampaignConstants.defaultConsentVersion} [DRAFT]',
                        style: TextStyle(
                          fontSize: 12,
                          color: GrsColors.duplicateAlert,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const Divider(height: 32),

            // Trilingual Statutory Statements
            _buildStatementCard('English', DdCampaignConstants.consentTextEn),
            const SizedBox(height: 12),
            _buildStatementCard(
              'සිංහල (Sinhala)',
              DdCampaignConstants.consentTextSi,
            ),
            const SizedBox(height: 12),
            _buildStatementCard(
              'தமிழ் (Tamil)',
              DdCampaignConstants.consentTextTa,
            ),
            const SizedBox(height: 24),

            // Consent Checkbox (Mandatory for M2.9)
            Container(
              decoration: BoxDecoration(
                color: GrsColors.primaryContainerLight,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: GrsColors.primaryLight),
              ),
              child: CheckboxListTile(
                value: _consentChecked,
                onChanged: (val) =>
                    setState(() => _consentChecked = val ?? false),
                activeColor: GrsColors.primaryLight,
                title: Text(
                  l10n.get('consentCheckboxLabel'),
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 15,
                  ),
                ),
                controlAffinity: ListTileControlAffinity.leading,
              ),
            ),
            const SizedBox(height: 24),

            GrsButton(
              text: 'Proceed to Beneficiary Form',
              onPressed: _consentChecked
                  ? () {
                      context.pushReplacement(
                        '/houses/${widget.houseId}/client/new?consent=true',
                      );
                    }
                  : null,
            ),
            const SizedBox(height: 12),
            TextButton(
              onPressed: () => context.pop(),
              child: Text(l10n.get('cancel')),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatementCard(String language, String text) {
    return GrsCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            language,
            style: const TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 13,
              color: GrsColors.secondaryLight,
            ),
          ),
          const SizedBox(height: 6),
          Text(text, style: const TextStyle(fontSize: 14, height: 1.45)),
        ],
      ),
    );
  }
}
