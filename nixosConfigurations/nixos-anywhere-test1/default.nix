{ modulesPath, ... }:
{
  imports = [
    (modulesPath + "/profiles/qemu-guest.nix")
    ./disko.nix
  ];

  nixpkgs.hostPlatform = "x86_64-linux";
  system.stateVersion = "26.11";

  networking.hostName = "nixos-anywhere-test1";

  # DigitalOcean boots droplets with SeaBIOS and gives no way to switch a
  # standard droplet to EFI: /sys/firmware/efi does not exist on the target.
  # GRUB installs to the disk itself, into the EF02 partition disko lays down,
  # and EFI support stays off.
  #
  # boot.loader.grub.devices is deliberately not set here. disko already sets
  # it to the disk carrying the EF02 partition, so setting it again produces
  # a duplicate and trips grub's "duplicated devices in mirroredBoots"
  # assertion. Leaving it to disko also keeps the device declared in exactly
  # one place, ./disko.nix, where it cannot drift from the disk being
  # partitioned.
  boot.loader.grub = {
    enable = true;
    efiSupport = false;
  };

  # net.ifnames=0 keeps the first virtio NIC named eth0, which is what the
  # droplet's own cloud image does. The serial console is the only way to read
  # boot output through the DigitalOcean web console if the host does not come
  # back on the network.
  boot.kernelParams = [
    "net.ifnames=0"
    "console=tty1"
    "console=ttyS0,115200"
  ];
}
