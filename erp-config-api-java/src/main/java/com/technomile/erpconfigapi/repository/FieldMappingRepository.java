package com.technomile.erpconfigapi.repository;

import com.technomile.erpconfigapi.entity.FieldMapping;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface FieldMappingRepository extends JpaRepository<FieldMapping, Long> {
    List<FieldMapping> findByStepPkOrderByArrayTargetPathAscSortOrderAsc(Long stepPk);

    Optional<FieldMapping> findByStepPkAndArrayTargetPathAndTargetPath(Long stepPk, String arrayTargetPath, String targetPath);
}
