import Gio from 'gi://Gio';
import St from 'gi://St';
const {GObject, Gtk} = imports.gi;

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import {
  QuickSlider,
  QuickMenuToggle,
  SystemIndicator,
} from 'resource:///org/gnome/shell/ui/quickSettings.js';

/// TODO
// 1. włączenie/wyłączenie menu toggle działa jako wyłączenie
// i włączenie trybu automatycznego wentylatora
// 2. tryb autoFan = trybik
//    tryb manual  = procenty
// 3. możliwość zmiany RPM/%

const SettingsSchema = 'org.gnome.desktop.interface';

const shellVersion = parseFloat(Config.PACKAGE_VERSION);

const iconPath = '/home/misiek/.local/share/gnome-shell/extensions/fwfan@mkarenko/icons';
const darkGear = `${iconPath}/gear-dark.svg`;
const lightGear = `${iconPath}/gear-light.svg`;

const darkGearIcon = Gio.icon_new_for_string(darkGear);
const lightGearIcon = Gio.icon_new_for_string(lightGear);

let fanRPM = 0;
let fanUsage = 0;
const maxFanRPM = 7561;
const fanPath = '/sys/class/hwmon/hwmon12/fan1_input';

const updateFanMetrics = () => {
  try {
    const file = Gio.File.new_for_path(fanPath);
    const [success, data] = file.load_contents(null);

    if (success) {
      const dataString = new TextDecoder('utf-8').decode(data);
      fanRPM = parseInt(dataString.trim(), 10);

      if (isNaN(fanRPM)) {
        console.error('Invalid RPM value');
        fanRPM = 0;
      }

      fanRPM = Math.max(0, Math.min(fanRPM, maxFanRPM));
      fanUsage = (fanRPM / maxFanRPM) * 100;

      console.log('Fan RPM:', fanRPM, 'Fan Usage:', fanUsage);
    } else {
      console.error('Failed to load fan data from file');
    }
  } catch (error) {
    console.error('Error while reading RPM:', error.message);
  }
};

const setFanAuto = () => {
  const process = new Gio.Subprocess({
    argv: ['sudo', 'ectool', 'autofanctrl'],
    flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
  });

  process.communicate_utf8_async(null, null, (proc, result) => {
    try {
      const output = proc.communicate_utf8_finish(result);
      console.log('Fan was set to auto mode:', output);
    } catch (error) {
      console.error(`Error while trying to set fan to auto mode: ${error.message}`);
    }
  });
};

const setFanDuty = () => {
  const sliderValue = this._settings.get_uint('slider-value') || 50;
  if (sliderValue >= 0 && sliderValue <= 100) {
    const process = new Gio.Subprocess({
      argv: ['sudo', 'ectool', 'fanduty', `${sliderValue}`],
      flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
    });

    process.communicate_utf8_async(null, (proc, result) => {
      try {
        const output = proc.communicate_utf8_finish(result);
        console.log(`Fan set to ${sliderValue}%:`, output);
      } catch (error) {
        console.error(`Error while setting fan to ${sliderValue}%: ${error.message}`);
      }
    });
  } else {
    console.log('Value must be between 0-100.');
  }
};

const SysIndicator = GObject.registerClass(
  class SysIndicator extends SystemIndicator {
    _init() {
      super._init();
    }
  }
);

const Indicator = GObject.registerClass(
  class Indicator extends PanelMenu.Button {
    _init(extensionObject) {
      super._init(0.0, _('Indicator'));

      this._extensionObject = extensionObject;
      this._settings = extensionObject.getSettings();
      this.settings = new Gio.Settings({schema_id: SettingsSchema});

      // dark | light mode detection
      const currentTheme = this.settings.get_string('color-scheme');
      const isDarkTheme = currentTheme.includes('prefer-dark');

      if (isDarkTheme) {
        this.add_child(
          new St.Icon({
            gicon: darkGearIcon,
            style_class: 'system-status-icon',
          })
        );
      } else {
        this.add_child(
          new St.Icon({
            gicon: lightGear,
            style_class: 'system-status-icon',
          })
        );
      }

      let item1 = new PopupMenu.PopupMenuItem(_('Fan'));
      let item2 = new PopupMenu.PopupMenuItem(_('Settings'));
      let item3 = new PopupMenu.PopupSeparatorMenuItem();
      let item4 = new PopupMenu.PopupMenuItem(_('Buy AMD Heatsink'));

      item2.connect('activate', () => {
        extensionObject.openPreferences();
      });

      item3.connect('activate', () => {
        Gio.AppInfo.launch_default_for_uri(
          'https://frame.work/gb/en/products/heatsink-and-fan-kit?v=FRANGS0001',
          null
        );
      });

      this.menu.addMenuItem(item2);
      this.menu.addMenuItem(item3);
      this.menu.addMenuItem(item4);
    }
  }
);

const FanSlider = GObject.registerClass(
  class FanSlider extends QuickSlider {
    _init(extensionObject) {
      super._init();

      this.iconReactive = false;
      this.iconPath = darkGearIcon;

      this._extensionObject = extensionObject;
      this._settings = extensionObject.getSettings();

      this._sliderChangedId = this.slider.connect(
        'notify::value',
        this._onSliderChanged.bind(this)
      );
      this.slider.accessible_name = _('Fan Slider');

      if (!this._settings) {
        console.error('GSettings schema not found.');
        this._sliderValue = 50;
      }

      this._settings.connect('changed::slider-value', this._onSettingsChanged.bind(this));
      this._onSettingsChanged();
    }

    _onSettingsChanged() {
      this.slider.block_signal_handler(this._sliderChangedId);
      const sliderValue = this._settings.get_uint('slider-value') || 50;
      this.slider.value = sliderValue / 100.0;
      this.slider.unblock_signal_handler(this._sliderChangedId);
    }

    _onSliderChanged() {
      updateFanMetrics();
      const percent = Math.floor(this.slider.value * 100);
      this._settings.set_uint('slider-value', percent);
    }
  }
);

const MenuToggle = GObject.registerClass(
  class MenuToggle extends QuickMenuToggle {
    _init(extensionObject) {
      super._init({
        title: _('Fan Control'),
        toggleMode: true,
      });

      this._extensionObject = extensionObject;
      this._settings = extensionObject.getSettings();
      this.settings = new Gio.Settings({schema_id: SettingsSchema});

      // dark | light mode detection
      const currentTheme = this.settings.get_string('color-scheme');
      const isDarkTheme = currentTheme.includes('prefer-dark');

      updateFanMetrics();

      this._updateHeader(isDarkTheme);

      this._sliderItem = new FanSlider(extensionObject);
      this.menu.box.add_child(this._sliderItem);

      this._itemsSection = new PopupMenu.PopupMenuSection();

      if (true) {
        this._itemsSection.addAction(_('Set to auto-mode'), () => {
          setFanAuto();
        });
      } else {
        this._itemsSection.addAction(_('Set to manual mode'), () => {
          setFanDuty();
        });
      }

      this.menu.addMenuItem(this._itemsSection);

      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
      const settingsItem = this.menu.addAction('Settings', () => extensionObject.openPreferences());

      settingsItem.visible = Main.sessionMode.allowSettings;
      this.menu._settingsActions[extensionObject.uuid] = settingsItem;

      this._sliderItem.slider.connect(
        'notify::value',
        this._onSliderValueChanged.bind(this, isDarkTheme)
      );
    }

    _updateHeader(isDarkTheme) {
      if (isDarkTheme) {
        this.menu.setHeader(darkGearIcon, _(`Usage: ${fanUsage.toFixed(2)}%`), _(`${fanRPM} RPM`));
      } else {
        this.menu.setHeader(lightGearIcon, _(`Usage: ${fanUsage.toFixed(2)}%`), _(`${fanRPM} RPM`));
      }
    }

    _onSliderValueChanged(isDarkTheme) {
      updateFanMetrics();
      this._updateHeader(isDarkTheme);
    }
  }
);

export default class FanExtension extends Extension {
  enable() {
    this._indicator = new Indicator(this);
    Main.panel.addToStatusArea(this.uuid, this._indicator);

    this._sysIndicator = new SysIndicator(this);
    this._sysIndicator.quickSettingsItems.push(new MenuToggle(this));

    Main.panel.statusArea.quickSettings.addExternalIndicator(this._sysIndicator);
  }

  disable() {
    this._indicator.destroy();
    this._indicator = null;

    this._sysIndicator.quickSettingsItems.forEach((item) => item.destroy());
    this._sysIndicator.destroy();
    this._sysIndicator = null;
  }
}
