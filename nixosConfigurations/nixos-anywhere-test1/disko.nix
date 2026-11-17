{
  disko.devices.disk.main = {
    type = "disk";

    # DigitalOcean's virtio disks carry no serial, so /dev/disk/by-id is empty
    # on this droplet and by-path is the only stable handle. It also cannot
    # resolve to /dev/vdb, which is the 490K cloud-init config ISO rather than
    # a spare disk. See the constraints table in the design doc.
    device = "/dev/disk/by-path/virtio-pci-0000:00:06.0";

    content = {
      type = "gpt";
      partitions = {
        # GRUB's core image needs somewhere to live on a GPT disk that boots
        # via BIOS. EF02 is the BIOS boot partition type code; it holds no
        # filesystem and is never mounted. Priority orders it ahead of the
        # root partition below, which would otherwise take the whole disk
        # first and leave nothing for it.
        boot = {
          size = "1M";
          type = "EF02";
          priority = 1;
        };
        root = {
          size = "100%";
          content = {
            type = "filesystem";
            format = "ext4";
            mountpoint = "/";
          };
        };
      };
    };
  };
}
